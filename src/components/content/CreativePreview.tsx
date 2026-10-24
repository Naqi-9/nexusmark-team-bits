import React, { useEffect, useMemo, useRef, useState } from 'react';
import { colord } from 'colord';
import { Download, ImageIcon, Loader2, Wand2 } from 'lucide-react';
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
  imageCapability: { configured: boolean; model: string | null } | null;
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
  const { width, height } = ASPECT_RATIOS[ratio];
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

  ctx.fillStyle = accent; ctx.fillRect(pad, y, 10, blockH);
  ctx.fillStyle = '#FFFFFF'; ctx.font = `800 ${size}px ${font}`;
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 12;
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

export function CreativePreview({ content, workspaceId, onImageAssetSaved, aspectRatio, onAspectRatioChange, brand, imageCapability, magicToken = 0, onMagicConsumed, savedImageUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [aiImage, setAiImage] = useState<{ dataUrl: string; rawDataUrl: string; composed: boolean; model: string; ratio: AspectRatio; assetUrl?: string } | null>(null);
  const lastMagic = useRef(0);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const brandKey = useMemo(() => JSON.stringify(brand), [brand]);

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
    if (imgBusy) return;
    setImgBusy(true); setImgError(null);
    try {
      const prompt = buildImagePrompt(content, brand.palette, brand.businessName);
      const res = await contentApi.image(prompt, aspectRatio, workspaceId);
      const rawDataUrl = `data:${res.mimeType};base64,${res.imageBase64}`;

      // Compose the finished post (image + headline + brand + logo). If that fails, keep the raw image.
      let finalDataUrl = rawDataUrl; let composed = false;
      try {
        const bg = await loadImage(rawDataUrl);
        if (!bg) throw new Error('image decode failed');
        const off = document.createElement('canvas');
        await renderComposedPost(off, bg, content, aspectRatio, brand);
        finalDataUrl = off.toDataURL('image/png'); composed = true;
      } catch (composeErr) {
        console.warn('[CreativePreview] compose failed, showing raw image', composeErr);
      }
      setAiImage({ dataUrl: finalDataUrl, rawDataUrl, composed, model: res.modelUsed, ratio: aspectRatio });

      try {
        const base64 = composed ? finalDataUrl.split(',')[1] : res.imageBase64;
        const asset = await persistGeneratedImage(workspaceId, base64, composed ? 'image/png' : res.mimeType);
        setAiImage(prev => prev ? { ...prev, assetUrl: asset.url } : prev);
        onImageAssetSaved?.(asset.url);
      } catch (storageErr) {
        setImgError(`Design created, but could not be persisted to Firebase Storage. It is temporary for this session, so download it. ${storageErr instanceof Error ? storageErr.message : ''}`.trim());
      }
    } catch (e) {
      setImgError(e instanceof Error ? e.message : 'Image generation failed.');
    } finally { setImgBusy(false); }
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

  const downloadAi = () => {
    if (!aiImage) return;
    fetch(aiImage.dataUrl).then(r => r.blob()).then(b => downloadBlob(`${slugify(content.title)}-${aiImage.ratio.replace(':', 'x')}-${aiImage.composed ? 'post' : 'ai'}.png`, b));
  };
  const downloadRaw = () => {
    if (!aiImage) return;
    fetch(aiImage.rawDataUrl).then(r => r.blob()).then(b => downloadBlob(`${slugify(content.title)}-${aiImage.ratio.replace(':', 'x')}-background.png`, b));
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
          <div className="text-xs font-semibold text-gray-700">AI post design</div>
          {imageCapability?.configured ? (
            <>
              <button className={primaryBtn} onClick={generateImage} disabled={imgBusy || !(content.imagePrompt.trim() || content.title.trim())}>
                {imgBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                {imgBusy ? 'Designing your post…' : aiImage ? 'Redesign post' : 'Design this post'}
              </button>
              <p className="text-[11px] text-gray-500">Uses the configured image model ({imageCapability.model}) for the picture. Your headline, brand name and logo are added on top by NexusMark so the text is always spelled correctly.</p>
              {imgBusy && magicToken > 0 && (
                <Notice tone="info"><span className="inline-flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5" /> Magic Design is creating the post from your calendar entry. This can take up to a minute.</span></Notice>
              )}
              {imgError && <Notice tone="error">{imgError}</Notice>}
              {aiImage && (
                <div className="space-y-2">
                  <img src={aiImage.dataUrl} alt={`AI designed post for ${content.title}`} className="rounded-lg border border-gray-200 max-h-[420px] w-auto max-w-full" />
                  <p className="text-[11px] text-gray-500">Picture by {aiImage.model} for {aiImage.ratio}{aiImage.composed ? ', with headline, brand name and logo added.' : '. The headline overlay could not be added, so this is the picture only.'} {aiImage.assetUrl ? 'Saved to Firebase Storage.' : 'Temporary for this session unless downloaded.'}</p>
                  <div className="flex flex-wrap gap-2">
                    <button className={ghostBtn} onClick={downloadAi}><Download className="w-3.5 h-3.5" /> Download {aiImage.composed ? 'final post' : 'image'}</button>
                    {aiImage.composed && <button className={ghostBtn} onClick={downloadRaw}><Download className="w-3.5 h-3.5" /> Background only</button>}
                  </div>
                </div>
              )}
              {!aiImage && savedImageUrl && (
                <div className="space-y-2">
                  <img src={savedImageUrl} alt={`Saved design for ${content.title}`} className="rounded-lg border border-gray-200 max-h-[420px] w-auto max-w-full" />
                  <p className="text-[11px] text-gray-500">Saved design for this entry.</p>
                </div>
              )}
            </>
          ) : (
            <Notice tone="warn">
              No image generation model is configured on the server, so only the creative brief and brand card are available.
              Set <code>IMAGE_GENERATION_MODEL</code> to enable real graphics.
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
