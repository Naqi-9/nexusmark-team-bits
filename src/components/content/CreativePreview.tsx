import React, { useEffect, useMemo, useRef, useState } from 'react';
import { colord } from 'colord';
import { Download, ImageIcon, Loader2, RefreshCw, Wand2 } from 'lucide-react';
import { ASPECT_RATIOS, type AspectRatio, type ContentPayload } from '../../lib/contentTypes.ts';
import { contentApi } from '../../lib/contentApi.ts';
import { persistGeneratedImage, authenticatedFetch } from '../../lib/firebase.ts';
import { downloadBlob, slugify } from '../../lib/download.ts';
import { buildImagePrompt } from '../../lib/magicDesign.ts';
import { Notice, ghostBtn, primaryBtn } from './ui.tsx';

export interface BrandAssets {
  businessName: string;
  palette: string[];
  fontFamily?: string;
  logoUrl?: string | null;
}

interface Props {
  content: ContentPayload;
  workspaceId: string;
  onImageAssetSaved?: (url: string) => void;
  aspectRatio: AspectRatio;
  onAspectRatioChange: (a: AspectRatio) => void;
  brand: BrandAssets;
  imageCapability: { configured: boolean; model: string | null; paidOnly?: boolean } | null;
  /** Increment to make the AI design the post automatically (Magic Design). 0 / undefined = never. */
  magicToken?: number;
  /** Called once the token has been acted on, so remounting this view never regenerates by accident. */
  onMagicConsumed?: () => void;
  /** Already persisted design for this item (shown until a new one is generated). */
  savedImageUrl?: string;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

async function loadProxiedImage(remoteUrl: string): Promise<HTMLImageElement | null> {
  try {
    const res = await authenticatedFetch(`/api/screenshot-proxy?url=${encodeURIComponent(remoteUrl)}`);
    if (!res.ok) return null;
    const objectUrl = URL.createObjectURL(await res.blob());
    try {
      return await loadImage(objectUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

const extForMime = (mime: string) => (mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png');
/** Firebase Storage rules accept uploads below 10 MB. Leave headroom. */
const MAX_UPLOAD_BYTES = 9.5 * 1024 * 1024;

/** Renders a simple on-brand text card locally. It is a template, NOT an AI-generated image. */
async function renderBrandCard(canvas: HTMLCanvasElement, content: ContentPayload, ratio: AspectRatio, brand: BrandAssets) {
  const { width, height } = ASPECT_RATIOS[ratio];
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const bg = brand.palette[0] || '#81171B';
  const accent = brand.palette[1] || '#FFFFFF';
  const dark = colord(bg).isDark();
  const fg = dark ? '#FFFFFF' : '#000000';
  const font = brand.fontFamily ? `"${brand.fontFamily}", system-ui, sans-serif` : 'system-ui, sans-serif';

  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = accent; ctx.fillRect(0, 0, width, 18);

  const pad = Math.round(width * 0.09);
  const text = (content.textOverlay || content.hook || content.title).slice(0, 140);
  const size = Math.round(width * (text.length > 80 ? 0.062 : 0.08));
  ctx.fillStyle = fg; ctx.font = `700 ${size}px ${font}`; ctx.textBaseline = 'top';
  const lines = wrapLines(ctx, text, width - pad * 2);
  const blockH = lines.length * size * 1.2;
  let y = Math.max(pad * 2, (height - blockH) / 2);
  for (const l of lines) { ctx.fillText(l, pad, y); y += size * 1.2; }

  ctx.font = `600 ${Math.round(width * 0.032)}px ${font}`;
  ctx.fillStyle = fg;
  ctx.fillText(brand.businessName, pad, height - pad - Math.round(width * 0.032));

  if (brand.logoUrl) {
    // Proxied through our SSRF-protected endpoint so the canvas is not tainted by a foreign origin.
    // The endpoint requires a Firebase ID token, which an <img src> cannot send, so fetch the bytes
    // with authenticatedFetch and hand the image a same-origin blob URL.
    const logo = await loadProxiedImage(brand.logoUrl);
    if (logo) {
      const h = Math.round(width * 0.09);
      const w = Math.min(Math.round((logo.width / logo.height) * h), Math.round(width * 0.3));
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(pad - 12, pad - 12, w + 24, h + 24);
      ctx.drawImage(logo, pad, pad, w, h);
    }
  }
}

/**
 * Draws the finished post: AI image as a full-bleed background, a readable gradient, the headline,
 * the brand name and the logo. The text is drawn locally so spelling and brand fonts are always correct.
 */
async function renderComposedPost(canvas: HTMLCanvasElement, bg: HTMLImageElement, content: ContentPayload, ratio: AspectRatio, brand: BrandAssets) {
  // Keep the model's resolution (never smaller than the standard social size, capped to keep files uploadable).
  const std = ASPECT_RATIOS[ratio];
  const width = Math.min(Math.max(std.width, bg.naturalWidth || bg.width), 2560);
  const height = Math.round((width * std.height) / std.width);
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  const accent = brand.palette[0] || '#81171B';
  const font = brand.fontFamily ? `"${brand.fontFamily}", system-ui, sans-serif` : 'system-ui, sans-serif';

  const scale = Math.max(width / bg.width, height / bg.height);
  const w = bg.width * scale, h = bg.height * scale;
  ctx.drawImage(bg, (width - w) / 2, (height - h) / 2, w, h);

  const grad = ctx.createLinearGradient(0, height * 0.3, 0, height);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.82)');
  ctx.fillStyle = grad; ctx.fillRect(0, height * 0.3, width, height * 0.7);

  const pad = Math.round(width * 0.08);
  const brandSize = Math.round(width * 0.03);
  const text = (content.textOverlay || content.hook || content.title).replace(/\*/g, '').slice(0, 120);
  const size = Math.round(width * (text.length > 70 ? 0.06 : 0.078));
  ctx.textBaseline = 'top';
  ctx.font = `800 ${size}px ${font}`;
  const lines = wrapLines(ctx, text, width - pad * 2 - 28).slice(0, 5);
  const lineH = size * 1.18;
  const blockH = lines.length * lineH;
  const brandY = height - pad - brandSize;
  let y = brandY - brandSize * 1.2 - blockH;

  ctx.fillStyle = accent; ctx.fillRect(pad, y, Math.max(10, Math.round(width * 0.009)), blockH);
  ctx.fillStyle = '#FFFFFF'; ctx.font = `800 ${size}px ${font}`;
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = Math.round(width * 0.011);
  for (const l of lines) { ctx.fillText(l, pad + 28, y); y += lineH; }
  ctx.shadowBlur = 0;

  ctx.font = `600 ${brandSize}px ${font}`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(brand.businessName, pad, brandY);

  if (brand.logoUrl) {
    const logo = await loadProxiedImage(brand.logoUrl);
    if (logo) {
      const lh = Math.round(width * 0.085);
      const lw = Math.min(Math.round((logo.width / logo.height) * lh), Math.round(width * 0.28));
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillRect(pad - 14, pad - 14, lw + 28, lh + 28);
      ctx.drawImage(logo, pad, pad, lw, lh);
    }
  }
}

type Stage = 'generating' | 'composing' | 'saving';
const STAGE_LABEL: Record<Stage, string> = {
  generating: 'Generating the image with the image model…',
  composing: 'Adding headline, brand name and logo…',
  saving: 'Saving the image to your Firebase Storage…',
};

export function CreativePreview({ content, workspaceId, onImageAssetSaved, aspectRatio, onAspectRatioChange, brand, imageCapability, magicToken = 0, onMagicConsumed, savedImageUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [aiImage, setAiImage] = useState<{ dataUrl: string; rawBase64: string; rawMime: string; rawDataUrl: string; composed: boolean; composedMime: string; model: string; ratio: AspectRatio; assetUrl?: string } | null>(null);
  const lastMagic = useRef(0);
  const genLock = useRef(false);            // set synchronously, so a double click can never start two requests
  const [stage, setStage] = useState<Stage | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);   // generation failed
  const [saveWarn, setSaveWarn] = useState<string | null>(null);   // image exists but is NOT persisted
  const [dlError, setDlError] = useState<string | null>(null);
  const [savedBroken, setSavedBroken] = useState(false);
  const imgBusy = stage !== null;
  const brandKey = useMemo(() => JSON.stringify(brand), [brand]);

  useEffect(() => { setSavedBroken(false); }, [savedImageUrl]);

  useEffect(() => {
    let cancelled = false;
    const c = canvasRef.current;
    if (!c) return;
    renderBrandCard(c, content, aspectRatio, brand)
      .then(() => { if (!cancelled) setCardError(null); })
      .catch(() => { if (!cancelled) setCardError('Could not render the brand card preview.'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content.textOverlay, content.hook, content.title, aspectRatio, brandKey]);

  const downloadCard = () => {
    canvasRef.current?.toBlob(b => { if (b) downloadBlob(`${slugify(content.title)}-${aspectRatio.replace(':', 'x')}-brand-card.png`, b); }, 'image/png');
  };

  const generateImage = async () => {
    if (genLock.current) return;
    genLock.current = true;
    setStage('generating'); setImgError(null); setSaveWarn(null); setDlError(null);
    try {
      const prompt = buildImagePrompt(content, brand.palette, brand.businessName);
      const res = await contentApi.image(prompt, aspectRatio, workspaceId);
      const rawDataUrl = `data:${res.mimeType};base64,${res.imageBase64}`;

      // Show the real model output immediately; composition only adds the headline on top.
      let finalDataUrl = rawDataUrl; let composed = false; let composedMime = res.mimeType;
      setStage('composing');
      try {
        const bg = await loadImage(rawDataUrl);
        if (!bg) throw new Error('image decode failed');
        const off = document.createElement('canvas');
        await renderComposedPost(off, bg, content, aspectRatio, brand);
        finalDataUrl = off.toDataURL('image/png'); composedMime = 'image/png';
        if (finalDataUrl.length * 0.75 > MAX_UPLOAD_BYTES) { finalDataUrl = off.toDataURL('image/jpeg', 0.92); composedMime = 'image/jpeg'; }
        composed = true;
      } catch (composeErr) {
        console.warn('[CreativePreview] compose failed, showing raw image', composeErr);
      }
      setAiImage({ dataUrl: finalDataUrl, rawBase64: res.imageBase64, rawMime: res.mimeType, rawDataUrl, composed, composedMime, model: res.modelUsed, ratio: aspectRatio });

      setStage('saving');
      try {
        const base64 = composed ? finalDataUrl.split(',')[1] : res.imageBase64;
        const asset = await persistGeneratedImage(workspaceId, base64, composed ? composedMime : res.mimeType);
        setAiImage(prev => prev ? { ...prev, assetUrl: asset.url } : prev);
        onImageAssetSaved?.(asset.url);
      } catch (storageErr) {
        setSaveWarn(`The image was generated but NOT saved to Firebase Storage, so it will disappear on refresh. Download it now. (${storageErr instanceof Error ? storageErr.message : 'Storage upload failed'})`);
      }
    } catch (e) {
      setImgError(e instanceof Error ? e.message : 'Image generation failed.');
    } finally { genLock.current = false; setStage(null); }
  };

  // Magic Design: Content Studio bumps the token and the AI designs this post immediately.
  useEffect(() => {
    if (!magicToken || magicToken === lastMagic.current) return;
    if (!imageCapability) return; // capabilities still loading; effect re-runs when they arrive
    lastMagic.current = magicToken;
    onMagicConsumed?.();
    if (imageCapability.configured) void generateImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magicToken, imageCapability]);

  const stem = () => `${slugify(brand.businessName)}-${slugify(content.title)}-${(aiImage?.ratio || aspectRatio).replace(':', 'x')}`;

  /** The untouched model output, in the exact format and resolution the model returned. */
  const downloadOriginal = () => {
    if (!aiImage) return;
    try { downloadBlob(`${stem()}-original.${extForMime(aiImage.rawMime)}`, base64ToBlob(aiImage.rawBase64, aiImage.rawMime)); setDlError(null); }
    catch { setDlError('Download failed. The image data could not be prepared. Try generating it again.'); }
  };
  const downloadPost = () => {
    if (!aiImage) return;
    try {
      const mime = aiImage.composed ? aiImage.composedMime : aiImage.rawMime;
      const b64 = (aiImage.composed ? aiImage.dataUrl : aiImage.rawDataUrl).split(',')[1];
      downloadBlob(`${stem()}-post.${extForMime(mime)}`, base64ToBlob(b64, mime)); setDlError(null);
    } catch { setDlError('Download failed. The image data could not be prepared. Try generating it again.'); }
  };
  /** Saved image after a refresh. Cross-origin fetch needs bucket CORS; if the browser blocks it, open the file instead. */
  const downloadSaved = async () => {
    if (!savedImageUrl) return;
    try {
      const r = await fetch(savedImageUrl);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      downloadBlob(`${stem()}-saved.${extForMime(blob.type || 'image/png')}`, blob); setDlError(null);
    } catch {
      const w = window.open(savedImageUrl, '_blank', 'noopener');
      setDlError(w ? 'Your browser blocked a direct download, so the image opened in a new tab. Right-click or long-press it to save.' : 'Download failed and the pop-up was blocked. Allow pop-ups for this site and try again.');
    }
  };

  const { width, height } = ASPECT_RATIOS[aspectRatio];

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Format" className="flex flex-wrap gap-2">
        {(Object.keys(ASPECT_RATIOS) as AspectRatio[]).map(r => (
          <button key={r} role="radio" aria-checked={aspectRatio === r} onClick={() => onAspectRatioChange(r)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${aspectRatio === r ? 'bg-[#81171B] text-white border-[#81171B]' : 'bg-white text-gray-800 border-gray-200 hover:border-[#81171B]'}`}>
            {ASPECT_RATIOS[r].label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-700">Brand card (template)</div>
          <div className="bg-gray-100 rounded-xl p-3 flex justify-center">
            <canvas ref={canvasRef} aria-label="Brand card preview" className="rounded-md shadow-sm max-h-[420px] w-auto max-w-full" style={{ aspectRatio: `${width} / ${height}` }} />
          </div>
          <Notice tone="info">This is a layout template filled with your text overlay, brand colors and logo. It is <strong>not</strong> an AI-generated image.</Notice>
          {cardError && <Notice tone="error">{cardError}</Notice>}
          <button className={ghostBtn} onClick={downloadCard}><Download className="w-3.5 h-3.5" /> Download PNG ({width}×{height})</button>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-700">AI generated image</div>
          {imageCapability?.configured ? (
            <>
              <button className={primaryBtn} onClick={generateImage} disabled={imgBusy || !(content.imagePrompt.trim() || content.title.trim())}>
                {imgBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : imgError ? <RefreshCw className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                {imgBusy ? 'Working…' : imgError ? 'Retry image' : aiImage ? 'Regenerate image' : 'Generate image'}
              </button>
              <p className="text-[11px] text-gray-500">
                Uses the configured image model ({imageCapability.model}) from your visual brief. Your headline, brand name and logo are added on top by NexusMark so the text is always spelled correctly.
                {imageCapability.paidOnly ? ' Google lists this model as paid-only, so each image is billed to the Gemini API project behind your key.' : ''}
              </p>
              {imgBusy && stage && (
                <div role="status" aria-live="polite"><Notice tone="info"><span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {STAGE_LABEL[stage]}{stage === 'generating' ? ' This can take up to two minutes.' : ''}</span></Notice></div>
              )}
              {imgBusy && magicToken > 0 && stage === 'generating' && (
                <Notice tone="info"><span className="inline-flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5" /> Magic Design is creating the post from your calendar entry.</span></Notice>
              )}
              {imgError && <div role="alert"><Notice tone="error">{imgError} Your written content is unchanged.</Notice></div>}
              {saveWarn && <div role="alert"><Notice tone="warn">{saveWarn}</Notice></div>}
              {dlError && <div role="alert"><Notice tone="error">{dlError}</Notice></div>}
              {aiImage && (
                <div className="space-y-2">
                  <img src={aiImage.dataUrl} alt={`AI generated image for ${content.title}`} className="rounded-lg border border-gray-200 max-h-[420px] w-auto max-w-full" />
                  <p className="text-[11px] text-gray-500">
                    Generated by {aiImage.model} for {aiImage.ratio}{aiImage.composed ? ', with headline, brand name and logo added.' : '. The headline overlay could not be added, so this is the picture only.'}{' '}
                    {aiImage.assetUrl ? 'Uploaded to your private Firebase Storage folder. Press Save so it stays attached to this deliverable in your Library.' : saveWarn ? 'Not saved.' : 'Not saved yet.'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button className={ghostBtn} onClick={downloadOriginal}><Download className="w-3.5 h-3.5" /> Download image ({extForMime(aiImage.rawMime).toUpperCase()}, original)</button>
                    {aiImage.composed && <button className={ghostBtn} onClick={downloadPost}><Download className="w-3.5 h-3.5" /> Download post with headline</button>}
                  </div>
                </div>
              )}
              {!aiImage && savedImageUrl && (
                <div className="space-y-2">
                  {savedBroken ? (
                    <Notice tone="warn">The saved image could not be loaded. It may have been deleted from Storage, or you may be offline. Generate it again to replace it.</Notice>
                  ) : (
                    <img src={savedImageUrl} onError={() => setSavedBroken(true)} alt={`Saved image for ${content.title}`} className="rounded-lg border border-gray-200 max-h-[420px] w-auto max-w-full" />
                  )}
                  <p className="text-[11px] text-gray-500">Saved image for this deliverable.</p>
                  {!savedBroken && <button className={ghostBtn} onClick={downloadSaved}><Download className="w-3.5 h-3.5" /> Download saved image</button>}
                </div>
              )}
            </>
          ) : (
            <Notice tone="warn">
              No image generation model is configured on the server, so only the creative brief and brand card are available.
              Set <code>IMAGE_GENERATION_MODEL</code> (for Nano Banana Pro: <code>gemini-3-pro-image</code>) to enable real images.
            </Notice>
          )}
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl p-4 text-xs space-y-1.5 bg-gray-50/60">
        <div className="font-bold text-gray-800">Creative brief</div>
        {([['Composition', content.creativeBrief.composition], ['Typography', content.creativeBrief.typography], ['Imagery', content.creativeBrief.imagery], ['Text overlay', content.creativeBrief.textOverlay], ['Logo placement', content.creativeBrief.logoPlacement]] as const).map(([k, v]) => v ? (
          <div key={k}><span className="font-semibold text-gray-700">{k}: </span><span className="text-gray-700">{v}</span></div>
        ) : null)}
      </div>
    </div>
  );
}
