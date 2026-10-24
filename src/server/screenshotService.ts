import * as cheerio from 'cheerio';
import { URL } from 'node:url';
import { validateAndNormalizeUrl, safeFetch } from './ssrfValidator.ts';

export interface WebsiteSnapshotResult {
  // Explicit dedicated field for actual browser screenshot
  websiteScreenshotUrl: string | null;
  mobileScreenshotUrl?: string | null;
  // Separate field for Open Graph social banner (never confused with screenshot)
  ogImageUrl: string | null;
  // Brand logo (never stored in screenshot field)
  logoUrl?: string | null;
  // Truthful status indicator
  screenshotStatus: 'captured' | 'preview_image' | 'unavailable';
  screenshotCapturedAt: string;
  viewport?: {
    width: number;
    height: number;
  };
  failureReason?: string;
  // Backwards compatibility fields
  screenshotUrl: string | null;
  previewImageUrl: string | null;
}

// In-flight capture deduplication to prevent redundant concurrent browser requests
const activeCaptures = new Map<string, Promise<WebsiteSnapshotResult>>();

function resolveUrl(relative: string | null | undefined, base: string): string | null {
  if (!relative) return null;
  const trimmed = relative.trim();
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('file:')) return null;

  try {
    return new URL(trimmed, base).toString();
  } catch {
    return null;
  }
}

/**
 * Validates that an image URL returns genuine visual image data (> 5KB, valid image MIME type).
 */
export async function verifyScreenshotResponse(
  imageUrl: string,
  timeoutMs: number = 8000
): Promise<{ valid: boolean; sizeBytes?: number; contentType?: string }> {
  if (!imageUrl) return { valid: false };

  try {
    const res = await safeFetch(imageUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 NexusMarkValidator/1.0',
        Accept: 'image/jpeg,image/png,image/webp,image/*;q=0.8',
      },
    }, { timeoutMs });

    if (!res.ok) return { valid: false };

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const isImageMime =
      contentType.startsWith('image/jpeg') ||
      contentType.startsWith('image/png') ||
      contentType.startsWith('image/webp') ||
      contentType.startsWith('image/');

    if (!isImageMime) return { valid: false };

    // Read initial chunk / buffer to verify non-trivial payload (> 5000 bytes)
    const arrayBuffer = await res.arrayBuffer();
    const sizeBytes = arrayBuffer.byteLength;

    // Reject tiny/blank images (such as 1x1 tracking pixels or broken error tiles)
    if (sizeBytes < 5000) {
      return { valid: false, sizeBytes, contentType };
    }

    return { valid: true, sizeBytes, contentType };
  } catch {
    return { valid: false };
  }
}

/**
 * Extracts OpenGraph or Twitter share image candidate from HTML without claiming it is a screenshot.
 */
export function extractOpenGraphImage(html: string, baseUrl: string): string | null {
  if (!html) return null;
  try {
    const $ = cheerio.load(html);
    const ogImageRaw =
      $('meta[property="og:image" i]').attr('content')?.trim() ||
      $('meta[name="twitter:image" i]').attr('content')?.trim() ||
      $('meta[property="og:image:secure_url" i]').attr('content')?.trim();

    return resolveUrl(ogImageRaw, baseUrl);
  } catch {
    return null;
  }
}

/**
 * Captures an actual browser-rendered screenshot of the target website.
 * Viewport: 1440 × 900 (desktop) and 375 × 812 (mobile).
 * SSRF protected with timeout safety and truthful status reporting.
 */
export async function captureWebsiteSnapshot(
  html: string,
  targetUrl: string,
  forceFresh: boolean = false
): Promise<WebsiteSnapshotResult> {
  const cacheKey = `${targetUrl.toLowerCase()}_${forceFresh ? Date.now() : 'standard'}`;

  // Deduplicate concurrent in-flight requests for the same URL
  if (!forceFresh && activeCaptures.has(targetUrl.toLowerCase())) {
    return activeCaptures.get(targetUrl.toLowerCase())!;
  }

  const capturePromise = (async (): Promise<WebsiteSnapshotResult> => {
    const now = new Date().toISOString();

    // 1. SSRF & URL Validation
    const validation = await validateAndNormalizeUrl(targetUrl);
    if (!validation.valid || !validation.normalizedUrl) {
      return {
        websiteScreenshotUrl: null,
        ogImageUrl: null,
        screenshotStatus: 'unavailable',
        screenshotCapturedAt: now,
        screenshotUrl: null,
        previewImageUrl: null,
        failureReason: validation.error || 'Destination URL failed SSRF validation.',
      };
    }

    const normalizedUrl = validation.normalizedUrl;
    const ogImageUrl = extractOpenGraphImage(html, normalizedUrl);

    // 2. Headless Browser Rendering Pipeline
    let capturedDesktopUrl: string | null = null;
    let capturedMobileUrl: string | null = null;

    // Option A: Custom configured SCREENSHOT_SERVICE_URL endpoint
    const customEndpoint = process.env.SCREENSHOT_SERVICE_URL;
    if (customEndpoint) {
      try {
        const endpointVal = await validateAndNormalizeUrl(customEndpoint);
        if (endpointVal.valid && endpointVal.normalizedUrl) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 9000);

          const response = await fetch(endpointVal.normalizedUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: normalizedUrl,
              viewport: { width: 1440, height: 900 },
              format: 'jpeg',
            }),
            signal: controller.signal,
            redirect: 'error',
          });

          clearTimeout(timeout);

          if (response.ok) {
            const data = await response.json();
            if (data?.screenshotUrl) {
              const test = await verifyScreenshotResponse(data.screenshotUrl, 5000);
              if (test.valid) {
                capturedDesktopUrl = data.screenshotUrl;
              }
            }
          }
        }
      } catch (err) {
        console.warn('[ScreenshotService] Custom SCREENSHOT_SERVICE_URL attempt failed:', err);
      }
    }

    // Option B: ScreenshotOne API (if configured via SCREENSHOTONE_API_KEY)
    if (!capturedDesktopUrl && process.env.SCREENSHOTONE_API_KEY) {
      try {
        const apiKey = process.env.SCREENSHOTONE_API_KEY;
        const s1Url = `https://api.screenshotone.com/take?access_key=${apiKey}&url=${encodeURIComponent(normalizedUrl)}&viewport_width=1440&viewport_height=900&format=jpeg&block_ads=true&block_cookie_banners=true&wait_until=networkidle0`;
        const test = await verifyScreenshotResponse(s1Url, 10000);
        if (test.valid) {
          capturedDesktopUrl = s1Url;
        }
      } catch (err) {
        console.warn('[ScreenshotService] ScreenshotOne attempt failed:', err);
      }
    }

    // Option C: Automattic / WordPress mShots Headless Browser Cluster (1440 × 900 Desktop Viewport)
    // High-capacity, robust production headless Chromium cluster rendering real HTML/CSS/JS.
    if (!capturedDesktopUrl) {
      try {
        const mshotDesktop = `https://s0.wp.com/mshots/v1/${encodeURIComponent(normalizedUrl)}?w=1440&h=900`;
        const test = await verifyScreenshotResponse(mshotDesktop, 10000);
        if (test.valid) {
          capturedDesktopUrl = mshotDesktop;
          capturedMobileUrl = `https://s0.wp.com/mshots/v1/${encodeURIComponent(normalizedUrl)}?w=375&h=812`;
        }
      } catch (err) {
        console.warn('[ScreenshotService] mShots desktop attempt failed:', err);
      }
    }

    // Option D: Microlink Headless Browser API
    if (!capturedDesktopUrl) {
      try {
        const microlinkUrl = `https://api.microlink.io?url=${encodeURIComponent(normalizedUrl)}&screenshot=true&meta=false&viewport.width=1440&viewport.height=900&waitForTimeout=1200`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 9000);

        const res = await fetch(microlinkUrl, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          const json = await res.json();
          const shotUrl = json?.data?.screenshot?.url;
          if (shotUrl) {
            const test = await verifyScreenshotResponse(shotUrl, 6000);
            if (test.valid) {
              capturedDesktopUrl = shotUrl;
            }
          }
        }
      } catch (err) {
        console.warn('[ScreenshotService] Microlink attempt failed:', err);
      }
    }

    // 3. Return Verified Result
    if (capturedDesktopUrl) {
      return {
        websiteScreenshotUrl: capturedDesktopUrl,
        mobileScreenshotUrl: capturedMobileUrl,
        ogImageUrl,
        screenshotStatus: 'captured',
        screenshotCapturedAt: now,
        viewport: {
          width: 1440,
          height: 900,
        },
        // Backwards compatibility
        screenshotUrl: capturedDesktopUrl,
        previewImageUrl: capturedDesktopUrl,
      };
    }

    // 4. Honest Fallback: Real screenshot could not be captured
    // If OpenGraph image exists and is verified, clearly disclose as preview_image
    if (ogImageUrl) {
      const ogTest = await verifyScreenshotResponse(ogImageUrl, 4000);
      if (ogTest.valid) {
        return {
          websiteScreenshotUrl: null,
          mobileScreenshotUrl: null,
          ogImageUrl,
          screenshotStatus: 'preview_image',
          screenshotCapturedAt: now,
          failureReason: 'Live browser capture was not available. Displaying verified OpenGraph social preview image.',
          screenshotUrl: ogImageUrl,
          previewImageUrl: ogImageUrl,
        };
      }
    }

    // 5. Total Fallback: Neither real screenshot nor preview image could be obtained
    return {
      websiteScreenshotUrl: null,
      mobileScreenshotUrl: null,
      ogImageUrl: null,
      screenshotStatus: 'unavailable',
      screenshotCapturedAt: now,
      failureReason: 'Website preview unavailable. Headless browser rendering timed out and no accessible social preview image was found.',
      screenshotUrl: null,
      previewImageUrl: null,
    };
  })();

  activeCaptures.set(targetUrl.toLowerCase(), capturePromise);
  try {
    return await capturePromise;
  } finally {
    activeCaptures.delete(targetUrl.toLowerCase());
  }
}
