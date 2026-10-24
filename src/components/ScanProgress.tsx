import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, ArrowLeft, Globe, ShieldCheck, Sparkles, Search, Palette, Layers, Lock } from 'lucide-react';
import { BrandLogo } from './BrandLogo.tsx';

export type ScanStage = 'connecting' | 'extracting' | 'analyzing' | 'checking_seo' | 'building_profile';

interface ScanProgressProps {
  currentStage: ScanStage;
  targetUrl: string;
  error: string | null;
  logoCandidate?: string | null;
  onRetry: () => void;
  onCancel: () => void;
}

interface StageDetail {
  id: ScanStage;
  label: string;
  subMessages: string[];
  icon: React.ElementType;
}

const STAGES: StageDetail[] = [
  {
    id: 'connecting',
    label: 'Connecting to your website',
    subMessages: [
      'Performing SSRF security validation and DNS lookup...',
      'Verifying host safety and response headers...',
      'Establishing secure HTTP connection...',
    ],
    icon: Globe,
  },
  {
    id: 'extracting',
    label: 'Extracting brand information',
    subMessages: [
      'Parsing HTML and discovering linked stylesheets...',
      'Extracting declared CSS custom properties and color rules...',
      'Discovering logo assets and font declarations...',
    ],
    icon: Palette,
  },
  {
    id: 'analyzing',
    label: 'Analyzing website structure',
    subMessages: [
      'Inspecting page hierarchy and internal navigation...',
      'Detecting Schema.org structured data and product catalogs...',
      'Evaluating value propositions and business description...',
    ],
    icon: Layers,
  },
  {
    id: 'checking_seo',
    label: 'Checking SEO opportunities',
    subMessages: [
      'Auditing page title and meta description tags...',
      'Checking heading tag hierarchy and image alt attributes...',
      'Verifying mobile viewport and canonical directives...',
    ],
    icon: Search,
  },
  {
    id: 'building_profile',
    label: 'Building your brand profile',
    subMessages: [
      'Synthesizing verified brand DNA with Gemini AI...',
      'Formulating target audience hypotheses and pain points...',
      'Preparing your permanent marketing workspace...',
    ],
    icon: Sparkles,
  },
];

export function ScanProgress({
  currentStage,
  targetUrl,
  error,
  logoCandidate,
  onRetry,
  onCancel,
}: ScanProgressProps) {
  const currentStageIndex = STAGES.findIndex(s => s.id === currentStage);
  const activeStageObj = STAGES[Math.max(0, currentStageIndex)];

  // Rotating micro-messages
  const [subMsgIdx, setSubMsgIdx] = useState(0);

  useEffect(() => {
    setSubMsgIdx(0);
    const interval = setInterval(() => {
      setSubMsgIdx(prev => (prev + 1) % activeStageObj.subMessages.length);
    }, 2400);

    return () => clearInterval(interval);
  }, [currentStage, activeStageObj.subMessages.length]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 sm:py-20">
      <div className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-10 shadow-lg space-y-8">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-6 border-b border-gray-100">
          <div className="flex items-center space-x-3.5">
            <BrandLogo
              logoUrl={logoCandidate}
              businessName={targetUrl.replace(/^https?:\/\//, '').split('.')[0]}
              size="md"
            />
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-bold text-black">Scanning Website</h2>
                <span className="w-2 h-2 rounded-full bg-[#81171B] animate-pulse" />
              </div>
              <p className="text-xs text-gray-500 font-mono truncate max-w-[200px] sm:max-w-sm mt-0.5">
                {targetUrl}
              </p>
            </div>
          </div>

          <button
            onClick={onCancel}
            type="button"
            className="text-xs text-gray-500 hover:text-black hover:bg-gray-50 px-3 py-1.5 border border-gray-200 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>

        {/* Error State */}
        {error ? (
          <div className="space-y-6 animate-fade-in">
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start space-x-3 text-red-900">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs sm:text-sm">
                <p className="font-bold text-red-900">Scan Incomplete</p>
                <p className="mt-1 text-red-700 leading-relaxed">{error}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
              <button
                onClick={onCancel}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 border border-gray-200 rounded-xl transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Home</span>
              </button>
              <button
                onClick={onRetry}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#81171B] hover:bg-[#540804] rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Scan</span>
              </button>
            </div>
          </div>
        ) : (
          /* Active Scanning Experience */
          <div className="space-y-8">
            {/* Visual Scanner Mockup Frame */}
            <div className="relative border border-gray-200 rounded-2xl p-4 bg-gray-50/50 overflow-hidden shadow-inner">
              {/* Browser bar */}
              <div className="flex items-center justify-between pb-3 border-b border-gray-200/80 text-[11px] font-mono text-gray-500">
                <div className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span className="ml-2 font-sans font-medium text-gray-700">Live Website Inspection</span>
                </div>
                <div className="flex items-center space-x-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px]">
                  <Lock className="w-3 h-3 text-emerald-600" />
                  <span>SSRF Safe</span>
                </div>
              </div>

              {/* Animated Scan Line (Reduced Motion Friendly) */}
              <div className="relative py-6 sm:py-8 flex flex-col items-center justify-center text-center space-y-3">
                <div className="relative w-16 h-16 rounded-2xl bg-white border border-gray-200 shadow-md flex items-center justify-center text-[#81171B]">
                  <activeStageObj.icon className="w-8 h-8 animate-pulse" />
                  <div className="absolute inset-0 rounded-2xl ring-2 ring-[#81171B]/20 animate-ping opacity-30" />
                </div>

                <div className="space-y-1 max-w-md">
                  <p className="text-sm sm:text-base font-bold text-black">
                    {activeStageObj.label}
                  </p>
                  <p className="text-xs text-[#81171B] font-medium transition-all duration-300">
                    {activeStageObj.subMessages[subMsgIdx]}
                  </p>
                </div>

                {/* Indeterminate Moving Progress Bar */}
                <div className="w-full max-w-sm h-1.5 bg-gray-200 rounded-full overflow-hidden relative mt-2">
                  <div className="h-full bg-[#81171B] rounded-full w-2/5 animate-shimmer" />
                </div>
              </div>
            </div>

            {/* Stages Timeline List */}
            <div className="space-y-2.5 pt-2">
              {STAGES.map((stage, idx) => {
                const isCompleted = idx < currentStageIndex;
                const isCurrent = idx === currentStageIndex;

                return (
                  <div
                    key={stage.id}
                    className={`flex items-center space-x-3.5 p-3 rounded-xl transition-all ${
                      isCurrent
                        ? 'bg-[#fdf5f5] border border-[#f4dcd9] shadow-xs'
                        : isCompleted
                        ? 'bg-white border border-gray-100 opacity-90'
                        : 'bg-white border border-transparent opacity-40'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : isCurrent ? (
                        <Loader2 className="w-5 h-5 text-[#81171B] animate-spin" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-xs sm:text-sm ${
                          isCurrent
                            ? 'font-bold text-black'
                            : isCompleted
                            ? 'font-medium text-gray-800'
                            : 'font-normal text-gray-500'
                        }`}
                      >
                        {stage.label}
                      </p>
                    </div>
                    {isCompleted && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        Done
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Security Guarantee Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-100 text-[11px] text-gray-500">
              <div className="flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>Zero script execution • Native DOM extraction</span>
              </div>
              <span className="hidden sm:inline">Stage {currentStageIndex + 1} of 5</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
