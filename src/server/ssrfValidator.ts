import dns from 'node:dns/promises';
import { URL } from 'node:url';

/**
 * Checks whether an IP address is in a private, loopback, or reserved range.
 */
export function isPrivateIp(ip: string): boolean {
  // Check IPv4
  const ipv4Match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1, 5).map(Number);
    const [first, second] = octets;

    // 0.0.0.0/8
    if (first === 0) return true;
    // 10.0.0.0/8 (Private network)
    if (first === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (first === 127) return true;
    // 169.254.0.0/16 (Link-local / Cloud Metadata)
    if (first === 169 && second === 254) return true;
    // 172.16.0.0/12 (Private network: 172.16 - 172.31)
    if (first === 172 && second >= 16 && second <= 31) return true;
    // 192.168.0.0/16 (Private network)
    if (first === 192 && second === 168) return true;
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (first === 100 && second >= 64 && second <= 127) return true;
    // 192.0.0.0/24 (IETF protocol assignments)
    if (first === 192 && second === 0 && octets[2] === 0) return true;
    // 198.18.0.0/15 (Benchmarking)
    if (first === 198 && (second === 18 || second === 19)) return true;
    // 224.0.0.0/4 (Multicast) and 240.0.0.0/4 (Reserved)
    if (first >= 224) return true;

    return false;
  }

  // Check IPv6
  const normalizedIpv6 = ip.toLowerCase();

  // IPv4-mapped addresses: judge by the embedded IPv4 address (dotted or hex form).
  const mappedDotted = normalizedIpv6.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedDotted) return isPrivateIp(mappedDotted[1]);
  const mappedHex = normalizedIpv6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }

  if (
    normalizedIpv6 === '::1' ||
    normalizedIpv6 === '::' ||
    normalizedIpv6.startsWith('fe80:') || // link-local
    normalizedIpv6.startsWith('fc') || normalizedIpv6.startsWith('fd') || // unique local address
    normalizedIpv6.startsWith('ff') // multicast
  ) {
    return true;
  }

  return false;
}

/**
 * Validates and normalizes target URL for safe external fetching.
 */
export async function validateAndNormalizeUrl(rawUrl: string): Promise<{ valid: boolean; normalizedUrl?: string; error?: string }> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'Please provide a valid website URL.' };
  }

  let trimmed = rawUrl.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    trimmed = `https://${trimmed}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Malformed URL. Please check the address format.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTP and HTTPS protocols are supported.' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Reject localhost, local, internal domain names
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname === 'metadata.google.internal' ||
    hostname === 'instance-data'
  ) {
    return { valid: false, error: 'Target address is a local or internal host, which is restricted.' };
  }

  // DNS lookup to resolve host to IP
  try {
    const lookupResult = await dns.lookup(hostname, { all: true });
    if (!lookupResult || lookupResult.length === 0) {
      return { valid: false, error: 'DNS resolution failed. Domain cannot be found.' };
    }

    for (const record of lookupResult) {
      if (isPrivateIp(record.address)) {
        return { valid: false, error: `Host resolves to restricted or private network address (${record.address}).` };
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown DNS error';
    return { valid: false, error: `Could not reach domain: ${message}` };
  }

  return { valid: true, normalizedUrl: parsed.toString() };
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxRedirects?: number;
}

type Validator = (url: string) => Promise<{ valid: boolean; normalizedUrl?: string; error?: string }>;

/**
 * Builds a fetch wrapper that re-validates EVERY redirect hop. Plain fetch() follows redirects
 * automatically, so validating only the first URL lets a public host redirect to localhost or a
 * cloud metadata address. Redirects are followed manually and each target is validated.
 *
 * Residual risk: DNS is resolved once for validation and again by fetch (DNS rebinding window).
 * Close it at the network layer (egress rules) for high-assurance deployments.
 */
export function createSafeFetch(validate: Validator, fetchImpl: typeof fetch) {
  return async function safeFetch(rawUrl: string, init: RequestInit = {}, options: SafeFetchOptions = {}): Promise<Response> {
    const { timeoutMs = 10000, maxRedirects = 5 } = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let current = rawUrl;
      for (let hop = 0; hop <= maxRedirects; hop++) {
        const validation = await validate(current);
        if (!validation.valid || !validation.normalizedUrl) {
          throw new Error(validation.error || 'Invalid destination URL.');
        }
        const response = await fetchImpl(validation.normalizedUrl, { ...init, redirect: 'manual', signal: controller.signal });
        if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
          const nextUrl = new URL(response.headers.get('location')!, validation.normalizedUrl).toString();
          try { await response.body?.cancel(); } catch { /* ignore */ }
          current = nextUrl;
          continue;
        }
        return response;
      }
      throw new Error('Too many redirects.');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Connection timed out after ${timeoutMs / 1000} seconds.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };
}

export const safeFetch = createSafeFetch(validateAndNormalizeUrl, (input, init) => fetch(input, init));

/**
 * Safely fetches an external page with timeout, max response size, and content-type enforcement.
 */
export async function safeFetchHtml(url: string, maxBytes: number = 5 * 1024 * 1024, timeoutMs: number = 10000): Promise<{ html: string; status: number; contentType: string }> {
  try {
    const response = await safeFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 NexusMarkScanner/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    }, { timeoutMs });

    if (!response.ok) {
      throw new Error(`Website responded with HTTP status ${response.status} (${response.statusText})`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml') && !contentType.includes('text/plain')) {
      throw new Error(`Unsupported content type: ${contentType}. Expected HTML.`);
    }

    // Read response up to maxBytes
    const reader = response.body?.getReader();
    if (!reader) {
      const text = await response.text();
      return { html: text.slice(0, maxBytes), status: response.status, contentType };
    }

    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        receivedBytes += value.length;
        chunks.push(value);
        if (receivedBytes >= maxBytes) {
          reader.cancel();
          break;
        }
      }
    }

    const buffer = Buffer.concat(chunks);
    const html = buffer.toString('utf-8');
    return { html, status: response.status, contentType };
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('Failed to fetch website.');
  }
}
