import * as cheerio from 'cheerio';
import { URL } from 'node:url';
import { safeFetch } from './ssrfValidator.ts';

export interface LogoCandidate {
  url: string;
  source: string;
  score: number;
  format?: string;
  width?: number;
  height?: number;
}

export interface LogoDiscoveryResult {
  logoUrl: string | null;
  logoSource: string;
  logoStatus: 'verified' | 'unverified' | 'fallback';
  logoCandidates: LogoCandidate[];
  logoLastCheckedAt: string;
}

function resolveUrl(relative: string | null | undefined, base: string): string | null {
  if (!relative) return null;
  const trimmed = relative.trim();
  // Safe data URIs (e.g. data:image/svg+xml or data:image/png)
  if (trimmed.startsWith('data:image/')) return trimmed;
  // Block unsafe protocols
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('file:') || trimmed.startsWith('ftp:')) return null;

  try {
    return new URL(trimmed, base).toString();
  } catch {
    return null;
  }
}

/**
 * Verifies whether a candidate logo URL is accessible and returns a valid image content type.
 */
async function verifyLogoUrl(url: string): Promise<boolean> {
  if (!url) return false;
  if (url.startsWith('data:image/')) return true;

  try {
    const res = await safeFetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 NexusMarkLogoChecker/1.0',
        'Accept': 'image/*,*/*;q=0.8',
      },
    }, { timeoutMs: 4000 });

    if (!res.ok) return false;
    const contentType = res.headers.get('content-type') || '';
    if (
      contentType.includes('image/') ||
      contentType.includes('svg') ||
      url.endsWith('.svg') ||
      url.endsWith('.png') ||
      url.endsWith('.jpg') ||
      url.endsWith('.webp')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Discovers and ranks candidate logos from website HTML.
 */
export async function discoverBrandLogo(html: string, baseUrl: string): Promise<LogoDiscoveryResult> {
  const $ = cheerio.load(html);
  const candidates: LogoCandidate[] = [];
  const seenUrls = new Set<string>();

  function addCandidate(url: string | null | undefined, source: string, score: number, format?: string) {
    if (!url) return;
    const resolved = resolveUrl(url, baseUrl);
    if (!resolved || seenUrls.has(resolved)) return;
    seenUrls.add(resolved);
    candidates.push({
      url: resolved,
      source,
      score,
      format: format || resolved.split('.').pop()?.split('?')[0],
    });
  }

  // 1. Schema.org JSON-LD Logo (Score: 100)
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const text = $(el).text();
      if (!text) return;
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : (parsed['@graph'] ? parsed['@graph'] : [parsed]);

      for (const item of items) {
        if (!item) continue;
        const type = item['@type'];
        if (type === 'Organization' || type === 'LocalBusiness' || type === 'Corporation' || type === 'Store' || type === 'Brand') {
          if (item.logo) {
            const logoVal = typeof item.logo === 'string' ? item.logo : (item.logo.url || item.logo['@id']);
            addCandidate(logoVal, 'Schema.org Structured Data', 100);
          }
          if (item.image) {
            const imgVal = typeof item.image === 'string' ? item.image : (item.image.url || item.image['@id']);
            addCandidate(imgVal, 'Schema.org Organization Image', 70);
          }
        }
      }
    } catch {
      // ignore
    }
  });

  // 2. Apple Touch Icon & Brand Icons (Score: 85)
  $('link[rel="apple-touch-icon" i]').each((_, el) => {
    const href = $(el).attr('href');
    addCandidate(href, 'Apple Touch Icon (High-Res Brand Asset)', 85);
  });

  // 3. Header / Navbar Logo Images (Score: 80 - 90)
  $('header, nav, [class*="header" i], [class*="nav" i], [id*="header" i]').each((_, headerEl) => {
    // Check images inside header
    $(headerEl).find('img').each((_, imgEl) => {
      const src = $(imgEl).attr('src') || $(imgEl).attr('data-src');
      const alt = $(imgEl).attr('alt')?.toLowerCase() || '';
      const className = $(imgEl).attr('class')?.toLowerCase() || '';
      const id = $(imgEl).attr('id')?.toLowerCase() || '';

      if (alt.includes('logo') || className.includes('logo') || id.includes('logo') || (src && src.toLowerCase().includes('logo'))) {
        addCandidate(src, 'Header Logo Image', 90);
      } else {
        // Any first prominent image in the header might be brand mark
        addCandidate(src, 'Header Navbar Image', 60);
      }
    });

    // Check SVG logo elements inside header
    $(headerEl).find('svg').each((_, svgEl) => {
      const className = $(svgEl).attr('class')?.toLowerCase() || '';
      const id = $(svgEl).attr('id')?.toLowerCase() || '';
      const ariaLabel = $(svgEl).attr('aria-label')?.toLowerCase() || '';

      if (className.includes('logo') || id.includes('logo') || ariaLabel.includes('logo')) {
        // Can reference linked sprite or serialized SVG
        const useHref = $(svgEl).find('use').attr('href') || $(svgEl).find('use').attr('xlink:href');
        if (useHref && !useHref.startsWith('#')) {
          addCandidate(useHref, 'Header SVG Logo Sprite', 85);
        }
      }
    });
  });

  // 4. Any Image with Logo in attributes across entire document (Score: 75)
  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    const alt = $(el).attr('alt')?.toLowerCase() || '';
    const className = $(el).attr('class')?.toLowerCase() || '';
    const id = $(el).attr('id')?.toLowerCase() || '';

    if (alt.includes('logo') || className.includes('logo') || id.includes('logo') || (src && src.toLowerCase().includes('logo'))) {
      addCandidate(src, 'Document Logo Image', 75);
    }
  });

  // 5. OpenGraph Share Image (Score: 45 - Fallback only, not automatic logo)
  const ogImage = $('meta[property="og:image" i]').attr('content')?.trim();
  if (ogImage) {
    addCandidate(ogImage, 'OpenGraph Share Image (Candidate Fallback)', 45);
  }

  // 6. Standard Favicon (Score: 30 - Last resort fallback)
  const faviconRel = $('link[rel="icon" i], link[rel="shortcut icon" i]').first().attr('href');
  if (faviconRel) {
    addCandidate(faviconRel, 'Website Favicon (Fallback)', 30);
  }

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Verify top candidate accessibility
  let bestLogo: LogoCandidate | null = null;
  let logoStatus: LogoDiscoveryResult['logoStatus'] = 'unverified';

  for (const candidate of candidates.slice(0, 4)) {
    const isAccessible = await verifyLogoUrl(candidate.url);
    if (isAccessible) {
      bestLogo = candidate;
      logoStatus = candidate.score >= 70 ? 'verified' : 'fallback';
      break;
    }
  }

  // If top candidate network check failed or timed out, retain candidate with unverified status
  if (!bestLogo && candidates.length > 0) {
    bestLogo = candidates[0];
    logoStatus = 'unverified';
  }

  return {
    logoUrl: bestLogo?.url || null,
    logoSource: bestLogo?.source || 'No Logo Detected',
    logoStatus: bestLogo ? logoStatus : 'fallback',
    logoCandidates: candidates.slice(0, 5),
    logoLastCheckedAt: new Date().toISOString(),
  };
}
