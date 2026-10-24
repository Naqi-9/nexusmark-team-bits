/**
 * Pure helpers for the image-generation endpoint. No SDK, zod or Firebase imports so they can be unit tested
 * without network access or credentials.
 */

export type ImageErrorCode =
  | 'not_configured' | 'unsupported_model' | 'model_not_found' | 'permission_denied' | 'billing_required'
  | 'rate_limited' | 'timeout' | 'blocked' | 'empty_response' | 'invalid_output' | 'generation_failed';

export class ImageGenError extends Error {
  code: ImageErrorCode;
  status: number;
  constructor(code: ImageErrorCode, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export const ALLOWED_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;
/** Base64 characters. ~15 MB of image bytes. Anything larger is refused instead of being streamed to the browser. */
export const MAX_IMAGE_BASE64_CHARS = 20_000_000;

/** Strips anything that looks like the API key before an error is logged. */
export function redactSecrets(text: string, secrets: Array<string | undefined> = [process.env.GEMINI_API_KEY]): string {
  let out = String(text ?? '');
  for (const s of secrets) if (s && s.length > 6) out = out.split(s).join('[redacted]');
  return out.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]');
}

/**
 * Gemini 3 image models are "thinking" models: the response can contain interim images flagged `thought: true`
 * before the final render. Only the LAST non-thought image part is the finished image.
 */
export function extractImageFromResponse(res: any): { imageBase64: string; mimeType: string } {
  const block = res?.promptFeedback?.blockReason;
  const candidate = res?.candidates?.[0];
  const finish = String(candidate?.finishReason || '');
  const parts: any[] = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const images = parts.filter(p => p?.inlineData?.data && !p?.thought);

  if (images.length === 0) {
    if (block || /SAFETY|PROHIBITED|BLOCKLIST|IMAGE_SAFETY|SPII|RECITATION/i.test(finish)) {
      throw new ImageGenError('blocked', 'The image model declined this request for safety reasons. Edit the visual brief to remove anything sensitive and retry.', 422);
    }
    const textPart = parts.find(p => typeof p?.text === 'string' && p.text.trim() && !p.thought);
    throw new ImageGenError(
      'empty_response',
      textPart
        ? 'The model answered with text instead of an image. Retry, or simplify the visual brief.'
        : 'The model returned no image. Retry, or check that this model supports image output for your key.',
      502
    );
  }

  const part = images[images.length - 1];
  const base64 = String(part.inlineData.data);
  const mimeType = String(part.inlineData.mimeType || 'image/png').toLowerCase().split(';')[0].trim();
  if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(mimeType)) {
    throw new ImageGenError('invalid_output', `The model returned an unsupported image format (${mimeType.slice(0, 40)}).`, 502);
  }
  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64.slice(0, 4096))) {
    throw new ImageGenError('invalid_output', 'The model returned image data that could not be read. Please retry.', 502);
  }
  if (base64.length > MAX_IMAGE_BASE64_CHARS) {
    throw new ImageGenError('invalid_output', 'The generated image is too large to deliver. Set IMAGE_GENERATION_SIZE to 1K or 2K and retry.', 502);
  }
  return { imageBase64: base64, mimeType };
}

/**
 * Maps an SDK / HTTP failure to an honest, key-free message. The raw error text is only inspected, never returned.
 * Word boundaries matter: a bare /rate/ would also match "generate".
 */
export function classifyImageError(err: any, model: string): ImageGenError {
  if (err instanceof ImageGenError) return err;
  const raw = String(err?.message || err || '');
  const statusNum = Number(err?.status ?? err?.code ?? err?.error?.code);

  if (/billing|payment|free tier is not available|only available on paid|enable billing/i.test(raw)) {
    return new ImageGenError('billing_required', `${model} is not available on the free tier. Google lists it as paid-only, so billing must be enabled on the Gemini API project that owns this key.`, 402);
  }
  if (/limit:\s*0\b/i.test(raw)) {
    return new ImageGenError('billing_required', `Your key has no quota for ${model} (limit 0). Google lists this model as paid-only; enable billing for the key's project or pick another image model.`, 402);
  }
  if (statusNum === 429 || /\b429\b|RESOURCE_EXHAUSTED|\bquota\b|rate[- ]limit/i.test(raw)) {
    return new ImageGenError('rate_limited', 'The image model is rate limited or out of quota right now. Wait a moment and retry, or check your Gemini API quota.', 429);
  }
  if (statusNum === 404 || /NOT_FOUND|is not found for API version|model.*not found|not supported for generateContent/i.test(raw)) {
    return new ImageGenError('model_not_found', `The model "${model}" was not found for this API key. Check IMAGE_GENERATION_MODEL against Google's current model list (the earlier preview ID was gemini-3-pro-image-preview).`, 404);
  }
  if (/API key not valid|API_KEY_INVALID|API key expired|invalid api key/i.test(raw)) {
    return new ImageGenError('not_configured', 'The configured Gemini API key was rejected by Google. Check GEMINI_API_KEY on the server.', 503);
  }
  if (statusNum === 403 || /PERMISSION_DENIED|permission|not allowed|forbidden/i.test(raw)) {
    return new ImageGenError('permission_denied', `This API key does not have permission to use ${model}. Check the key's project, region and model access in Google AI Studio.`, 403);
  }
  if (/timeout|timed out|ETIMEDOUT|AbortError|aborted|DEADLINE_EXCEEDED/i.test(raw) || statusNum === 504) {
    return new ImageGenError('timeout', 'Image generation took too long. Please retry.', 504);
  }
  if (/ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN|fetch failed|network/i.test(raw)) {
    return new ImageGenError('generation_failed', 'The server could not reach the Gemini API. Please retry in a moment.', 502);
  }
  if (statusNum === 400 || /INVALID_ARGUMENT/i.test(raw)) {
    return new ImageGenError('unsupported_model', `Google rejected the request for ${model}. The model may not support the requested image options.`, 400);
  }
  return new ImageGenError('generation_failed', 'Image generation failed. Please retry.', 502);
}

/** imageSize is only sent to Gemini 3 image models; earlier image models reject it. Defaults to 2K (same price as 1K for Pro). */
export function resolveImageSize(model: string, envValue: string | undefined): '1K' | '2K' | '4K' | null {
  if (!/^gemini-3/i.test(model)) return null;
  const v = String(envValue || '').trim().toUpperCase();
  return v === '1K' || v === '2K' || v === '4K' ? v : '2K';
}

/** True for the Nano Banana Pro model family (paid-only according to Google's pricing page). */
export function isNanoBananaPro(model: string | null | undefined): boolean {
  return /^gemini-3-pro-image/i.test(model || '');
}

/** Key used to refuse an identical request from the same user while the first is still running. */
export function inFlightKey(uid: string, workspaceId: string, prompt: string, aspectRatio: string): string {
  let h = 5381;
  const s = `${prompt}|${aspectRatio}`;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `${uid}:${workspaceId}:${h.toString(36)}`;
}
