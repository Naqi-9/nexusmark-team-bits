import { Router, Request, Response } from 'express';
import { validateAndNormalizeUrl, safeFetch } from './ssrfValidator.ts';
import { crawlWebsite } from './crawler.ts';
import {
  analyzeBrandWithGemma,
  chatWithMarketingStrategist,
  generateMarketingDeliverable,
  DEFAULT_GEMMA_MODEL,
  StrategistError,
} from './geminiService.ts';
import { captureWebsiteSnapshot } from './screenshotService.ts';
import {
  GenerateRequestSchema,
  RegenerateSectionSchema,
  CalendarRequestSchema,
  RegenerateEntrySchema,
  ImageRequestSchema,
  generateContentVariations,
  regenerateSection,
  generateCalendar,
  regenerateCalendarEntry,
  generateBrandImage,
  imageGenerationStatus,
} from './contentStudioService.ts';

import { requireFirebaseAuth, requireOwnedWorkspace } from './authMiddleware.ts';

export const apiRouter = Router();

// Health Check with Gemma 4 Attribution
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    gemmaConfigured: Boolean(process.env.GEMINI_API_KEY),
    gemmaModel: DEFAULT_GEMMA_MODEL,
    hackathonTrack: 'Best Use of Gemma 4',
  });
});

// All API routes except the minimal health check require a verified Firebase ID token.
apiRouter.use(requireFirebaseAuth);

// URL Pre-validation
apiRouter.post('/verify-url', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ valid: false, error: 'URL is required.' });
    }

    const result = await validateAndNormalizeUrl(url);
    if (!result.valid) {
      return res.status(400).json({ valid: false, error: result.error });
    }

    return res.json({ valid: true, normalizedUrl: result.normalizedUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Validation failed';
    return res.status(500).json({ valid: false, error: message });
  }
});

// Full Website Scanner & Multimodal Brand Intelligence via Gemma 4
apiRouter.post('/scan', async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required.' });
    }

    // 1. SSRF & URL Validation
    const validation = await validateAndNormalizeUrl(url);
    if (!validation.valid || !validation.normalizedUrl) {
      return res.status(400).json({
        error: validation.error || 'Invalid or inaccessible URL. Local/private hosts and malformed addresses are forbidden.',
      });
    }

    const targetUrl = validation.normalizedUrl;

    // 2. Crawl & Extract real website data
    const crawlResult = await crawlWebsite(targetUrl, 3);
    const extracted = crawlResult.primaryData;

    // 3. Gemma 4 Multimodal Brand Intelligence Analysis
    const snapshotUrl =
      extracted.snapshot?.websiteScreenshotUrl ||
      extracted.snapshot?.screenshotUrl ||
      extracted.snapshot?.previewImageUrl;
    const aiAnalysis = await analyzeBrandWithGemma(extracted, snapshotUrl);

    // 4. Derive Workspace Name
    const businessName = aiAnalysis.businessName || extracted.businessIdentity.name || 'Business';
    const suggestedWorkspaceName = `${businessName.trim()} Marketing Workspace`;

    const scanId = `scan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    return res.json({
      scanId,
      sourceUrl: targetUrl,
      scannedUrls: crawlResult.scannedUrls,
      pagesScanned: crawlResult.pagesScanned,
      durationMs: Date.now() - startTime,
      businessIdentity: extracted.businessIdentity,
      visualIdentity: extracted.visualIdentity,
      snapshot: extracted.snapshot,
      businessInfo: extracted.businessInfo,
      seo: extracted.seo,
      ecommerce: extracted.ecommerce,
      aiAnalysis,
      suggestedWorkspaceName,
      createdAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error('Scan API error:', err);
    const message = err instanceof Error ? err.message : 'An error occurred while scanning the website.';
    return res.status(500).json({
      error: message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Interactive Marketing Strategist Chat Endpoint
apiRouter.post('/chat', requireOwnedWorkspace, async (req: Request, res: Response) => {
  try {
    const { workspaceContext, history = [], message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required.' });
    }

    if (!workspaceContext || !workspaceContext.businessName) {
      return res.status(400).json({ error: 'Valid workspaceContext is required.' });
    }

    const result = await chatWithMarketingStrategist({
      workspaceContext,
      history,
      userPrompt: message,
    });

    return res.json(result);
  } catch (err: unknown) {
    console.error('Strategist chat API error:', err);
    if (err instanceof StrategistError) {
      return res.status(err.status).json({ error: err.message, code: err.code, retryable: err.code !== 'not_configured' && err.code !== 'unsupported_model' });
    }
    const message = err instanceof Error ? err.message : 'Strategist chat failed.';
    return res.status(500).json({ error: message, code: 'generation_failed', retryable: true });
  }
});

// Marketing Deliverable Generator Endpoint (Calendar, Ads, SEO, Strategy)
apiRouter.post('/generate-deliverable', requireOwnedWorkspace, async (req: Request, res: Response) => {
  try {
    const { type, workspaceContext, userInstructions } = req.body;

    const validTypes = ['content_calendar', 'brand_strategy', 'ad_campaign', 'seo_plan'];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({
        error: `Invalid deliverable type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    if (!workspaceContext || !workspaceContext.businessName) {
      return res.status(400).json({ error: 'Valid workspaceContext is required.' });
    }

    const result = await generateMarketingDeliverable({
      type,
      workspaceContext,
      userInstructions,
    });

    return res.json(result);
  } catch (err: unknown) {
    console.error('Deliverable generation API error:', err);
    const message = err instanceof Error ? err.message : 'Failed to generate deliverable.';
    return res.status(500).json({ error: message });
  }
});

// -------------------------------------------------------------
// Content Studio & Content Calendar (Gemma 4)
// -------------------------------------------------------------
function sendContentError(res: Response, err: unknown, label: string) {
  console.error(`[Content] ${label} error:`, err);
  if (err instanceof StrategistError) {
    return res.status(err.status).json({ error: err.message, code: err.code, retryable: err.code !== 'not_configured' && err.code !== 'unsupported_model' });
  }
  return res.status(500).json({ error: 'Something went wrong. Please retry.', code: 'generation_failed', retryable: true });
}

function badRequest(res: Response, zerr: { issues: { path: PropertyKey[]; message: string }[] }) {
  const first = zerr.issues[0];
  return res.status(400).json({
    error: `Invalid request${first ? `: ${first.path.join('.')} ${first.message}` : ''}`,
    code: 'invalid_request',
    retryable: false,
  });
}

apiRouter.get('/content/capabilities', (_req: Request, res: Response) => {
  res.json({
    textModel: DEFAULT_GEMMA_MODEL,
    textConfigured: Boolean(process.env.GEMINI_API_KEY),
    image: imageGenerationStatus(),
  });
});

apiRouter.post('/content/generate', requireOwnedWorkspace, async (req: Request, res: Response) => {
  const parsed = GenerateRequestSchema.safeParse(req.body?.request);
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    return res.json(await generateContentVariations(req.body?.context, parsed.data));
  } catch (err) {
    return sendContentError(res, err, 'generate');
  }
});

apiRouter.post('/content/regenerate-section', requireOwnedWorkspace, async (req: Request, res: Response) => {
  const parsed = RegenerateSectionSchema.safeParse(req.body?.input);
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    return res.json(await regenerateSection(req.body?.context, parsed.data));
  } catch (err) {
    return sendContentError(res, err, 'regenerate-section');
  }
});

apiRouter.post('/content/calendar', requireOwnedWorkspace, async (req: Request, res: Response) => {
  const parsed = CalendarRequestSchema.safeParse(req.body?.request);
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    return res.json(await generateCalendar(req.body?.context, parsed.data));
  } catch (err) {
    return sendContentError(res, err, 'calendar');
  }
});

apiRouter.post('/content/regenerate-entry', requireOwnedWorkspace, async (req: Request, res: Response) => {
  const parsed = RegenerateEntrySchema.safeParse(req.body?.input);
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    return res.json(await regenerateCalendarEntry(req.body?.context, parsed.data));
  } catch (err) {
    return sendContentError(res, err, 'regenerate-entry');
  }
});

apiRouter.post('/content/image', requireOwnedWorkspace, async (req: Request, res: Response) => {
  const parsed = ImageRequestSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    return res.json(await generateBrandImage(parsed.data));
  } catch (err) {
    return sendContentError(res, err, 'image');
  }
});

// Dedicated On-Demand Screenshot Capture & Regeneration Endpoint
apiRouter.post('/capture-screenshot', requireOwnedWorkspace, async (req: Request, res: Response) => {
  try {
    const { url, forceFresh = false } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Website URL is required.' });
    }

    const val = await validateAndNormalizeUrl(url);
    if (!val.valid || !val.normalizedUrl) {
      return res.status(400).json({ error: val.error || 'Invalid or forbidden destination URL.' });
    }

    // Call screenshot capture engine
    const snapshot = await captureWebsiteSnapshot('', val.normalizedUrl, Boolean(forceFresh));

    return res.json({
      success: snapshot.screenshotStatus === 'captured',
      targetUrl: val.normalizedUrl,
      ...snapshot,
    });
  } catch (err: unknown) {
    console.error('[ApiRouter] Screenshot capture error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to capture screenshot.',
      screenshotStatus: 'unavailable',
    });
  }
});

// Secure SSRF-Protected Image Proxy Endpoint.
// Requires a Firebase ID token (global middleware above), so it must be called with
// authenticatedFetch(); a plain <img src> cannot send the Authorization header.
const PROXY_MAX_BYTES = 5 * 1024 * 1024;
const PROXY_ALLOWED_TYPES = /^image\/(png|jpe?g|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon)(;|$)/i;

apiRouter.get('/screenshot-proxy', async (req: Request, res: Response) => {
  try {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    if (!rawUrl) {
      return res.status(400).send('Image URL query parameter is required.');
    }

    // safeFetch validates the URL and every redirect hop against the SSRF rules.
    let imageRes: Awaited<ReturnType<typeof safeFetch>>;
    try {
      imageRes = await safeFetch(rawUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 NexusMarkProxy/1.0',
          Accept: 'image/jpeg,image/png,image/webp,image/*;q=0.8',
        },
      }, { timeoutMs: 10000 });
    } catch {
      return res.status(403).send('Restricted or invalid target URL.');
    }

    if (!imageRes.ok) {
      return res.status(502).send('Failed to fetch image.');
    }

    const contentType = imageRes.headers.get('content-type') || '';
    if (!PROXY_ALLOWED_TYPES.test(contentType)) {
      return res.status(415).send('Target is not a supported image type.');
    }

    // Stream with a hard size cap so a hostile host cannot exhaust memory.
    const reader = imageRes.body?.getReader();
    if (!reader) return res.status(502).send('Failed to read image.');
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.length;
        if (total > PROXY_MAX_BYTES) {
          await reader.cancel();
          return res.status(413).send('Image is too large.');
        }
        chunks.push(value);
      }
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Defence in depth: an SVG opened directly must not run script in the app's origin.
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'");
    // Authenticated response: must not be stored by shared caches.
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.send(Buffer.concat(chunks));
  } catch (err: unknown) {
    console.warn('[ScreenshotProxy] Proxy streaming failed:', err);
    return res.status(502).send('Failed to retrieve proxied image.');
  }
});
