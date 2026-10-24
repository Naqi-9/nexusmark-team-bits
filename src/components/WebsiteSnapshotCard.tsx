import React, { useState } from 'react';
import {
  ExternalLink,
  Maximize2,
  X,
  Globe,
  Camera,
  Smartphone,
  Monitor,
  RefreshCw,
  AlertCircle,
  ImageOff,
  CheckCircle2,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo.tsx';

interface WebsiteSnapshotCardProps {
  websiteScreenshotUrl?: string | null;
  mobileScreenshotUrl?: string | null;
  ogImageUrl?: string | null;
  screenshotUrl?: string | null;
  screenshotStatus?: 'captured' | 'preview_image' | 'unavailable';
  screenshotCapturedAt?: string;
  previewImageUrl?: string | null;
  businessName: string;
  sourceUrl: string;
  logoUrl?: string | null;
  className?: string;
  onRegenerateScreenshot?: () => Promise<void>;
  isRegenerating?: boolean;
}

export function WebsiteSnapshotCard({
  websiteScreenshotUrl,
  mobileScreenshotUrl,
  ogImageUrl,
  screenshotUrl,
  screenshotStatus = 'unavailable',
  screenshotCapturedAt,
  previewImageUrl,
  businessName,
  sourceUrl,
  logoUrl,
  className = '',
  onRegenerateScreenshot,
  isRegenerating = false,
}: WebsiteSnapshotCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [activeViewport, setActiveViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Dedicated real screenshot takes absolute priority
  const realScreenshot = websiteScreenshotUrl || screenshotUrl;
  const activeImage =
    activeViewport === 'mobile' && mobileScreenshotUrl
      ? mobileScreenshotUrl
      : realScreenshot || ogImageUrl || previewImageUrl;

  const displayImage = !imageFailed ? activeImage : null;
  const isCapturedScreenshot = Boolean(realScreenshot && screenshotStatus === 'captured' && !imageFailed);
  const isPreviewImage = Boolean(!isCapturedScreenshot && (ogImageUrl || previewImageUrl) && !imageFailed);
  const isAvailable = Boolean(displayImage && (isCapturedScreenshot || isPreviewImage));

  const handleRetry = async () => {
    if (!onRegenerateScreenshot || isRegenerating || retrying) return;
    setRetrying(true);
    setImageFailed(false);
    try {
      await onRegenerateScreenshot();
    } catch (e) {
      console.warn('Screenshot regeneration failed:', e);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <>
      <div className={`bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col ${className}`}>
        {/* Browser Mockup Top Bar */}
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
            <div className="flex items-center space-x-1.5 ml-2 px-2.5 py-0.5 bg-white border border-gray-200 rounded-md font-mono text-[11px] text-gray-600 max-w-[160px] sm:max-w-xs truncate">
              <span className="text-emerald-600">https://</span>
              <span className="truncate">{sourceUrl.replace(/^https?:\/\//, '')}</span>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            {/* Viewport switcher if mobile screenshot is present */}
            {mobileScreenshotUrl && isCapturedScreenshot && (
              <div className="hidden sm:flex items-center bg-gray-200/70 p-0.5 rounded-lg text-[10px]">
                <button
                  type="button"
                  onClick={() => setActiveViewport('desktop')}
                  className={`px-1.5 py-0.5 rounded flex items-center space-x-1 ${
                    activeViewport === 'desktop' ? 'bg-white shadow-2xs font-semibold text-black' : 'text-gray-600 hover:text-black'
                  }`}
                  title="Desktop 1440x900 viewport"
                >
                  <Monitor className="w-3 h-3" />
                  <span>Desktop</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveViewport('mobile')}
                  className={`px-1.5 py-0.5 rounded flex items-center space-x-1 ${
                    activeViewport === 'mobile' ? 'bg-white shadow-2xs font-semibold text-black' : 'text-gray-600 hover:text-black'
                  }`}
                  title="Mobile 375x812 viewport"
                >
                  <Smartphone className="w-3 h-3" />
                  <span>Mobile</span>
                </button>
              </div>
            )}

            {isAvailable && (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="p-1 text-gray-500 hover:text-black hover:bg-gray-200/50 rounded transition-colors cursor-pointer"
                title="Expand preview"
                aria-label="Expand website preview"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}

            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1 text-xs text-[#81171B] hover:underline font-medium ml-1"
            >
              <span>Visit</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Preview Frame Container (16:9 Aspect Ratio) */}
        <div className="relative aspect-video w-full bg-gray-100 flex items-center justify-center overflow-hidden">
          {isAvailable ? (
            <div className="relative w-full h-full group">
              <img
                src={displayImage!}
                alt={`Website screenshot for ${businessName}`}
                className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-102"
                onError={() => setImageFailed(true)}
                loading="lazy"
              />

              {/* Hover overlay with Inspect action */}
              <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="px-4 py-2 bg-white/95 text-black font-semibold text-xs rounded-lg shadow-md flex items-center space-x-2 hover:bg-white transition-all cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Inspect Full Resolution</span>
                </button>
              </div>

              {/* Verified Status Tag */}
              <div className="absolute top-2.5 left-2.5 flex items-center space-x-1.5">
                {isCapturedScreenshot ? (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-black/75 backdrop-blur-sm text-white text-[10px] font-medium shadow-xs">
                    <Camera className="w-3 h-3 text-emerald-400" />
                    <span>Real Browser Screenshot</span>
                    <span className="text-gray-400 font-mono">
                      ({activeViewport === 'mobile' ? '375×812' : '1440×900'})
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-amber-900/80 backdrop-blur-sm text-amber-100 text-[10px] font-medium shadow-xs">
                    <AlertCircle className="w-3 h-3 text-amber-300" />
                    <span>OpenGraph Preview Banner (Not Live Screenshot)</span>
                  </span>
                )}
              </div>
            </div>
          ) : (
            /* Honest Fallback with Retry Option */
            <div className="p-6 text-center space-y-3 max-w-sm mx-auto">
              <ImageOff className="w-9 h-9 text-gray-400 mx-auto" />
              <div className="space-y-1">
                <p className="text-xs font-bold text-gray-800">Website preview unavailable</p>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Headless browser capture did not return a valid visual image for this URL.
                </p>
              </div>

              {onRegenerateScreenshot && (
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={isRegenerating || retrying}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#81171B] hover:bg-[#540804] rounded-lg shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating || retrying ? 'animate-spin' : ''}`} />
                  <span>{isRegenerating || retrying ? 'Capturing Screenshot...' : 'Retry Screenshot Capture'}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Snapshot Footer Details */}
        <div className="p-3 bg-white border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 min-w-0">
            <BrandLogo logoUrl={logoUrl} businessName={businessName} size="sm" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-black truncate">{businessName}</p>
              <p className="text-[10px] text-gray-500 font-mono truncate">{sourceUrl}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {onRegenerateScreenshot && isAvailable && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={isRegenerating || retrying}
                className="text-[11px] text-gray-500 hover:text-black flex items-center space-x-1 p-1 hover:bg-gray-100 rounded transition-colors"
                title="Recapture fresh screenshot"
              >
                <RefreshCw className={`w-3 h-3 ${isRegenerating || retrying ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Recapture</span>
              </button>
            )}

            {isCapturedScreenshot ? (
              <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center space-x-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>Captured</span>
              </span>
            ) : isPreviewImage ? (
              <span className="text-[10px] font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Social Card
              </span>
            ) : (
              <span className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                Unavailable
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxOpen && displayImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 sm:p-8"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="relative max-w-5xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <BrandLogo logoUrl={logoUrl} businessName={businessName} size="sm" />
                <div>
                  <span className="text-sm font-bold text-black">{businessName}</span>
                  <p className="text-[11px] text-gray-500 font-mono">{sourceUrl}</p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-semibold text-gray-700 hover:text-black border border-gray-200 rounded-lg inline-flex items-center space-x-1"
                >
                  <span>Open Website</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxOpen(false)}
                  className="p-1.5 text-gray-500 hover:text-black rounded-lg hover:bg-gray-200/50"
                  aria-label="Close preview"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-gray-100">
              <img
                src={displayImage}
                alt={`Full resolution preview for ${businessName}`}
                className="max-w-full max-h-[75vh] object-contain rounded-lg border border-gray-200 shadow-sm"
              />
            </div>

            <div className="p-3 bg-white border-t border-gray-200 text-xs text-gray-500 flex items-center justify-between">
              <span>{isCapturedScreenshot ? 'Live Browser Viewport (1440 × 900)' : 'OpenGraph Banner Preview'}</span>
              <span>{screenshotCapturedAt ? `Captured ${new Date(screenshotCapturedAt).toLocaleDateString()}` : 'Snapshot'}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
