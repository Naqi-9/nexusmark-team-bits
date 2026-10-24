import React, { useState } from 'react';
import {
  ExternalLink,
  Sparkles,
  Palette,
  Type,
  Users,
  ShoppingBag,
  Share2,
  Search,
  CheckCircle2,
  AlertTriangle,
  Info,
  ArrowRight,
  Edit2,
  FolderPlus,
  Loader2,
  LogIn,
  Layers,
  Copy,
  Check,
  Target,
  TrendingUp,
  ShieldCheck,
  BarChart2,
  Bot,
  Eye,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { ExtractedWebsiteData } from '../server/extractor.ts';
import { AiBrandAnalysis } from '../server/geminiService.ts';
import { BrandLogo } from './BrandLogo.tsx';
import { WebsiteSnapshotCard } from './WebsiteSnapshotCard.tsx';

export interface ScanResultData {
  scanId: string;
  sourceUrl: string;
  scannedUrls: string[];
  pagesScanned: number;
  durationMs: number;
  businessIdentity: ExtractedWebsiteData['businessIdentity'];
  visualIdentity: ExtractedWebsiteData['visualIdentity'];
  businessInfo: ExtractedWebsiteData['businessInfo'];
  seo: ExtractedWebsiteData['seo'];
  ecommerce: ExtractedWebsiteData['ecommerce'];
  aiAnalysis: AiBrandAnalysis;
  suggestedWorkspaceName: string;
  createdAt: string;
  snapshot?: ExtractedWebsiteData['snapshot'];
  logoCandidates?: any[];
}

interface ScanResultsProps {
  data: ScanResultData;
  onCreateWorkspace: (workspaceName: string) => Promise<void>;
  onRescan: () => void;
}

export function ScanResults({ data, onCreateWorkspace, onRescan }: ScanResultsProps) {
  const { user, signInWithGoogle } = useAuth();
  const [workspaceName, setWorkspaceName] = useState(data.suggestedWorkspaceName);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'brand' | 'seo' | 'products'>('all');
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  const handleCopy = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex(null), 2000);
  };

  const handleCreate = async () => {
    if (!workspaceName.trim()) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (!user) {
        await signInWithGoogle();
      }
      await onCreateWorkspace(workspaceName);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create workspace.';
      setSubmitError(msg);
      setIsSubmitting(false);
    }
  };

  const businessName = data.aiAnalysis.businessName || data.businessIdentity.name || 'Your Business';
  const businessDescription = data.aiAnalysis.businessDescription || data.businessIdentity.description || 'No description extracted.';
  const industry = data.aiAnalysis.industry || 'Technology & Commerce';

  // Severity count
  const criticalCount = data.seo.issues.filter(i => i.severity === 'critical').length;
  const warningCount = data.seo.issues.filter(i => i.severity === 'warning').length;
  const goodCount = data.seo.issues.filter(i => i.severity === 'good').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* Top Banner & Header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-gray-100">
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full w-fit border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Scan Complete • {data.pagesScanned} {data.pagesScanned === 1 ? 'Page' : 'Pages'} Analyzed</span>
            </div>
            <div className="flex items-center gap-3">
              <BrandLogo
                logoUrl={data.businessIdentity.logoUrl}
                businessName={businessName}
                size="lg"
              />
              <h1 className="text-2xl sm:text-3xl font-bold text-black tracking-tight">
                {businessName}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
              <a
                href={data.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1 font-mono text-xs text-[#81171B] hover:underline"
              >
                <span>{data.sourceUrl}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <span>•</span>
              <span className="font-medium text-black">{industry}</span>
              <span>•</span>
              <span className="text-xs text-gray-500">Duration: {(data.durationMs / 1000).toFixed(1)}s</span>
            </div>
            <p className="text-sm text-gray-700 max-w-3xl leading-relaxed pt-1">
              {businessDescription}
            </p>
          </div>

          {/* Action Box */}
          <div className="bg-[#fdf5f5] border border-[#f4dcd9] rounded-xl p-5 lg:min-w-[340px] space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-[#540804]">
                  Workspace Name
                </label>
                {!isEditingName && (
                  <button
                    onClick={() => setIsEditingName(true)}
                    className="text-xs text-[#81171B] hover:underline inline-flex items-center space-x-1"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                )}
              </div>
              {isEditingName ? (
                <div className="mt-1 flex items-center space-x-2">
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#81171B]"
                    autoFocus
                  />
                  <button
                    onClick={() => setIsEditingName(false)}
                    className="px-2.5 py-1.5 text-xs bg-white text-gray-800 border border-gray-200 rounded-md font-medium"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <p className="text-sm font-semibold text-black mt-0.5 truncate">{workspaceName}</p>
              )}
            </div>

            <p className="text-xs text-gray-600 leading-normal">
              Creates a persistent workspace storing this brand profile, SEO audit history, and verified extraction facts.
            </p>

            {submitError && (
              <p className="text-xs text-red-600 font-medium">{submitError}</p>
            )}

            <button
              onClick={handleCreate}
              disabled={isSubmitting || !workspaceName.trim()}
              className="w-full inline-flex items-center justify-center space-x-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#81171B] hover:bg-[#540804] active:bg-[#540804] rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving to Firestore...</span>
                </>
              ) : (
                <>
                  {user ? <FolderPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                  <span>{user ? 'Create My Workspace' : 'Sign In & Create Workspace'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Filter Navigation */}
        <div className="flex items-center space-x-2 pt-4">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'all'
                ? 'bg-[#81171B] text-white'
                : 'text-gray-600 hover:text-black hover:bg-gray-100'
            }`}
          >
            All Insights
          </button>
          <button
            onClick={() => setActiveTab('brand')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'brand'
                ? 'bg-[#81171B] text-white'
                : 'text-gray-600 hover:text-black hover:bg-gray-100'
            }`}
          >
            Brand DNA & Voice
          </button>
          <button
            onClick={() => setActiveTab('seo')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'seo'
                ? 'bg-[#81171B] text-white'
                : 'text-gray-600 hover:text-black hover:bg-gray-100'
            }`}
          >
            SEO Audit ({data.seo.issues.length})
          </button>
          {data.ecommerce.products.length > 0 && (
            <button
              onClick={() => setActiveTab('products')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'products'
                  ? 'bg-[#81171B] text-white'
                  : 'text-gray-600 hover:text-black hover:bg-gray-100'
              }`}
            >
              Products ({data.ecommerce.products.length})
            </button>
          )}
        </div>
      </div>

      {/* Grid of Extracted Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Brand DNA & Visual Identity */}
        {(activeTab === 'all' || activeTab === 'brand') && (
          <div className="lg:col-span-2 space-y-8">
            {/* Gemma 4 Multimodal Brand Intelligence Signature Card */}
            <div className="bg-gradient-to-br from-white to-[#fdf8f8] border border-[#f4dcd9] rounded-2xl p-6 sm:p-7 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#f4dcd9]">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-[#81171B] text-white flex items-center justify-center shadow-xs">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-base font-bold text-black">Multimodal Brand Intelligence</h2>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-[#81171B]">
                        Gemma 4 Signature
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">
                      Evaluated from DOM structure, color palettes, and visual snapshot perception
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 text-xs">
                  <div className="flex items-center space-x-1.5 px-3 py-1 bg-white border border-gray-200 rounded-full font-mono text-[11px]">
                    <Bot className="w-3.5 h-3.5 text-[#81171B]" />
                    <span>{data.aiAnalysis.modelAttribution?.modelUsed || 'Attribution unavailable'}</span>
                  </div>
                  {data.aiAnalysis.modelAttribution?.isMultimodal ? (
                    <span className="px-2.5 py-1 rounded-full bg-purple-50 text-purple-800 border border-purple-200 font-medium text-[11px]">
                      Multimodal Visual
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 font-medium text-[11px]">
                      Text-Only Analysis
                    </span>
                  )}
                </div>
              </div>

              {/* Visual vs Copy Harmony Card */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-[#81171B]" />
                      Visual vs Copy Harmony
                    </span>
                    <span className="text-xs font-bold text-black bg-gray-100 px-2 py-0.5 rounded-md">
                      Score: {data.aiAnalysis.visualVsMessagingDiscrepancies?.alignmentScore ?? 88}/100
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 leading-relaxed">
                    {data.aiAnalysis.visualVsMessagingDiscrepancies?.notes ||
                      'Visual presentation and written messaging show cohesive alignment in positioning and customer intent.'}
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs space-y-2">
                  <span className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-[#81171B]" />
                    Visual Identity Language
                  </span>
                  <p className="text-xs text-gray-700 leading-relaxed">
                    {data.aiAnalysis.visualIdentityDesignLanguage?.overallAesthetic ||
                      'Clean modern digital aesthetic with structured typographic hierarchy and clear viewport presence.'}
                  </p>
                  <p className="text-[11px] text-gray-500 italic">
                    Atmosphere: {data.aiAnalysis.visualIdentityDesignLanguage?.colorAtmosphere || 'Balanced brand color accents.'}
                  </p>
                </div>
              </div>

              {/* Top 3 Priority Actions */}
              {data.aiAnalysis.top3PriorityActions && data.aiAnalysis.top3PriorityActions.length > 0 && (
                <div className="space-y-3 pt-2">
                  <span className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-[#81171B]" />
                    Top 3 Priority Marketing Actions
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {data.aiAnalysis.top3PriorityActions.map((act, idx) => (
                      <div key={idx} className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-1.5 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-4 h-4 rounded-full bg-[#81171B] text-white text-[9px] font-bold flex items-center justify-center">
                            {act.priority || idx + 1}
                          </span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {act.impact} Impact
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-black">{act.title}</h4>
                        <p className="text-[11px] text-gray-600 leading-relaxed">{act.actionableSteps}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Brand Intelligence Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex items-center space-x-2.5 pb-4 border-b border-gray-100">
                <Sparkles className="w-5 h-5 text-[#81171B]" />
                <h2 className="text-lg font-bold text-black">Brand DNA & Tone of Voice</h2>
              </div>

              {/* Tone & Characteristics */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Tone & Personality</h3>
                <p className="text-sm font-medium text-black bg-gray-50 p-3 rounded-lg border border-gray-100">
                  {data.aiAnalysis.brandVoice.tone}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {data.aiAnalysis.brandVoice.personalityTraits.map((trait, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-md border border-gray-200"
                    >
                      {trait}
                    </span>
                  ))}
                </div>
              </div>

              {/* Do & Don't Guidelines */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Brand Do's</span>
                  </h4>
                  <ul className="text-xs text-emerald-950 space-y-1.5 list-disc pl-4">
                    {data.aiAnalysis.brandVoice.doList.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 bg-rose-50/50 border border-rose-100 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    <span>Brand Don'ts</span>
                  </h4>
                  <ul className="text-xs text-rose-950 space-y-1.5 list-disc pl-4">
                    {data.aiAnalysis.brandVoice.dontList.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Value Propositions */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Core Value Propositions</h3>
                <div className="space-y-2">
                  {data.aiAnalysis.valuePropositions.map((prop, idx) => (
                    <div key={idx} className="flex items-start space-x-2.5 p-3 rounded-lg border border-gray-100 bg-white">
                      <div className="w-5 h-5 rounded-full bg-[#fdf5f5] text-[#81171B] flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                        {idx + 1}
                      </div>
                      <p className="text-sm text-gray-800">{prop}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Target Audience Hypotheses */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-gray-600" />
                    <span>Target Audience Profiles</span>
                  </h3>
                  <span className="text-[11px] font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    AI Hypotheses (Based on Site Facts)
                  </span>
                </div>

                <div className="space-y-3">
                  {data.aiAnalysis.targetAudienceHypotheses.map((aud, idx) => (
                    <div key={idx} className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 space-y-2">
                      <p className="text-sm font-bold text-black">{aud.persona}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                        <div>
                          <span className="font-semibold text-gray-700">Key Pain Points:</span>
                          <ul className="list-disc pl-4 text-gray-600 mt-1 space-y-0.5">
                            {aud.painPoints.map((p, i) => (
                              <li key={i}>{p}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <span className="font-semibold text-gray-700">Buying Motivations:</span>
                          <ul className="list-disc pl-4 text-gray-600 mt-1 space-y-0.5">
                            {aud.buyingMotivations.map((m, i) => (
                              <li key={i}>{m}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Content Marketing Themes */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
                <Layers className="w-5 h-5 text-[#81171B]" />
                <h2 className="text-lg font-bold text-black">Campaign Content Themes</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {data.aiAnalysis.contentThemes.map((theme, idx) => (
                  <div key={idx} className="p-4 rounded-xl border border-gray-200 bg-white space-y-2">
                    <h3 className="text-sm font-bold text-black">{theme.title}</h3>
                    <p className="text-xs text-gray-600">{theme.description}</p>
                    <div className="pt-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Sample Angles</p>
                      <ul className="text-xs text-gray-700 list-disc pl-4 mt-1 space-y-0.5">
                        {theme.samplePostAngles.map((angle, i) => (
                          <li key={i}>{angle}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Right Column: Visual Identity, Snapshot, SEO, Social */}
        <div className={`space-y-8 ${activeTab === 'brand' ? 'lg:col-span-1' : (activeTab === 'seo' || activeTab === 'products' ? 'lg:col-span-3' : 'lg:col-span-1')}`}>
          {/* Website Snapshot / Preview Card */}
          {(activeTab === 'all' || activeTab === 'brand') && (
            <WebsiteSnapshotCard
              websiteScreenshotUrl={data.snapshot?.websiteScreenshotUrl || data.snapshot?.screenshotUrl}
              mobileScreenshotUrl={data.snapshot?.mobileScreenshotUrl}
              ogImageUrl={data.snapshot?.ogImageUrl}
              screenshotUrl={data.snapshot?.screenshotUrl}
              screenshotStatus={data.snapshot?.screenshotStatus}
              screenshotCapturedAt={data.snapshot?.screenshotCapturedAt}
              previewImageUrl={data.snapshot?.previewImageUrl}
              businessName={businessName}
              sourceUrl={data.sourceUrl}
              logoUrl={data.businessIdentity.logoUrl}
            />
          )}

          {/* Extracted Colors */}
          {(activeTab === 'all' || activeTab === 'brand') && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <div className="flex items-center space-x-2">
                  <Palette className="w-4 h-4 text-[#81171B]" />
                  <h2 className="text-sm font-bold text-black uppercase tracking-wider">Visual Identity & Colors</h2>
                </div>
                <span className="text-[11px] text-gray-500 font-medium">Click any swatch to copy</span>
              </div>

              {/* Color Extraction Diagnostics or Warning */}
              {data.visualIdentity.unreliableColors && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">Notice: Neutral Fallback Palette</p>
                    <p className="text-[11px] text-amber-800">
                      The scanned site has minimal declared CSS color rules in accessible HTML. High-contrast neutrals have been selected to avoid guessing.
                    </p>
                  </div>
                </div>
              )}

              {data.visualIdentity.colors.length > 0 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {data.visualIdentity.colors.map((color, idx) => {
                      const isCopied = copiedHex === color.hex;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleCopy(color.hex)}
                          className="group p-2.5 border border-gray-200 hover:border-[#81171B] rounded-xl text-left space-y-1.5 transition-all bg-white hover:shadow-xs cursor-pointer"
                        >
                          <div
                            className="w-full h-10 rounded-lg border border-gray-200 shadow-inner flex items-end justify-end p-1.5"
                            style={{ backgroundColor: color.hex }}
                          >
                            <span className="p-1 rounded bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                              {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-mono font-bold text-black group-hover:text-[#81171B]">
                              {isCopied ? 'Copied!' : color.hex}
                            </p>
                            <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                              {color.role || 'accent'}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-500 truncate">{color.source}</p>
                        </button>
                      );
                    })}
                  </div>
                  <div className="pt-1 flex flex-col space-y-1 text-[11px] text-gray-500">
                    <p>
                      Extracted from declared CSS rules, inline styles, and custom properties on {data.sourceUrl}.
                    </p>
                    {data.visualIdentity.diagnostics && (
                      <p className="text-[10px] text-gray-400">
                        {data.visualIdentity.diagnostics.stylesheetsParsed} external stylesheet(s) parsed • {data.visualIdentity.diagnostics.uniqueColorsFound} colors evaluated • {data.visualIdentity.diagnostics.customPropertiesCount} custom properties
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  No distinct CSS color declarations detected on accessible pages. Defaulting to high-contrast brand neutrals.
                </p>
              )}

              {/* Declared Typography */}
              <div className="pt-3 border-t border-gray-100 space-y-2">
                <div className="flex items-center space-x-2">
                  <Type className="w-4 h-4 text-gray-600" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600">Detected Typography</h3>
                </div>
                {data.visualIdentity.fonts.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {data.visualIdentity.fonts.map((f, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 text-xs font-mono bg-gray-50 text-gray-800 rounded border border-gray-200"
                      >
                        {f.family}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">
                    No custom web font declarations found; system defaults were used.
                  </p>
                )}
              </div>

              {/* Social Channels */}
              <div className="pt-3 border-t border-gray-100 space-y-2">
                <div className="flex items-center space-x-2">
                  <Share2 className="w-4 h-4 text-gray-600" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600">Discovered Social Profiles</h3>
                </div>
                {Object.keys(data.businessInfo.socialLinks).length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {Object.entries(data.businessInfo.socialLinks).map(([platform, link]) => (
                      <a
                        key={platform}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded border border-gray-200"
                      >
                        <span className="capitalize">{platform}</span>
                        <ExternalLink className="w-2.5 h-2.5 text-gray-400" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">No public social media links found on scanned pages.</p>
                )}
              </div>
            </div>
          )}

          {/* SEO Audit Findings */}
          {(activeTab === 'all' || activeTab === 'seo') && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div className="flex items-center space-x-2.5">
                  <Search className="w-5 h-5 text-[#81171B]" />
                  <h2 className="text-base font-bold text-black">SEO Health Audit</h2>
                </div>
                <div className="flex items-center space-x-1.5 text-xs">
                  {criticalCount > 0 && (
                    <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-semibold">
                      {criticalCount} Critical
                    </span>
                  )}
                  {warningCount > 0 && (
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                      {warningCount} Warnings
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                    {goodCount} Passed
                  </span>
                </div>
              </div>

              {/* Visual Health Score Gauge */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <div className="relative w-16 h-16 flex items-center justify-center flex-shrink-0">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" stroke="#e5e7eb" strokeWidth="10" fill="transparent" />
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        stroke={criticalCount > 0 ? '#81171B' : (warningCount > 0 ? '#f59e0b' : '#10b981')}
                        strokeWidth="10"
                        strokeDasharray="251.2"
                        strokeDashoffset={251.2 - (251.2 * (goodCount / (data.seo.issues.length || 1)))}
                        strokeLinecap="round"
                        fill="transparent"
                      />
                    </svg>
                    <span className="absolute font-black text-sm text-black">
                      {Math.round((goodCount / (data.seo.issues.length || 1)) * 100)}%
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-black">
                      {criticalCount > 0 ? 'Optimization Needed' : (warningCount > 0 ? 'Moderate Health' : 'Excellent Foundation')}
                    </p>
                    <p className="text-xs text-gray-500">
                      {goodCount} of {data.seo.issues.length} audit checks satisfied on inspected pages.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <div className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-center">
                    <span className="text-[10px] text-gray-400 block font-semibold">VIEWPORT</span>
                    <span className="font-bold text-black">{data.seo.hasMobileViewport ? 'Mobile Ready' : 'Missing'}</span>
                  </div>
                  <div className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-center">
                    <span className="text-[10px] text-gray-400 block font-semibold">CANONICAL</span>
                    <span className="font-bold text-black">{data.seo.hasCanonical ? 'Declared' : 'None'}</span>
                  </div>
                </div>
              </div>

              {/* Issues List */}
              <div className="space-y-3">
                {data.seo.issues.map((issue) => {
                  const isCrit = issue.severity === 'critical';
                  const isWarn = issue.severity === 'warning';
                  const isGood = issue.severity === 'good';

                  return (
                    <div
                      key={issue.id}
                      className={`p-4 rounded-xl border text-xs space-y-1.5 ${
                        isCrit
                          ? 'bg-red-50/50 border-red-200'
                          : isWarn
                          ? 'bg-amber-50/50 border-amber-200'
                          : isGood
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1.5">
                          {isCrit && <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
                          {isWarn && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                          {isGood && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                          {!isCrit && !isWarn && !isGood && <Info className="w-3.5 h-3.5 text-blue-600" />}
                          <span className="font-bold text-black text-sm">{issue.title}</span>
                        </div>
                        <span className="uppercase text-[10px] font-semibold px-1.5 py-0.5 rounded tracking-wide border border-current">
                          {issue.severity}
                        </span>
                      </div>
                      <p className="text-gray-700">
                        <span className="font-medium text-black">Evidence:</span> {issue.evidence}
                      </p>
                      <p className="text-gray-800 pt-0.5">
                        <span className="font-medium text-[#81171B]">Recommendation:</span> {issue.recommendation}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Marketing Opportunities */}
          {(activeTab === 'all' || activeTab === 'brand') && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center space-x-2 pb-2 border-b border-gray-100">
                <Sparkles className="w-4 h-4 text-[#81171B]" />
                <h2 className="text-sm font-bold text-black uppercase tracking-wider">Quick-Win Growth Opportunities</h2>
              </div>
              <div className="space-y-3">
                {data.aiAnalysis.marketingOpportunities.map((opp, idx) => (
                  <div key={idx} className="p-3 rounded-lg border border-gray-200 bg-gray-50/50 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-black">{opp.title}</p>
                      <div className="flex items-center space-x-1 text-[10px]">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                          {opp.impact} Impact
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">
                          {opp.effort}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 leading-normal">{opp.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Extracted Products (if detected) */}
          {(activeTab === 'all' || activeTab === 'products') && data.ecommerce.products.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <div className="flex items-center space-x-2">
                  <ShoppingBag className="w-4 h-4 text-[#81171B]" />
                  <h2 className="text-sm font-bold text-black uppercase tracking-wider">Extracted Product Catalog</h2>
                </div>
                <span className="text-xs text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded font-medium border border-emerald-200">
                  {data.ecommerce.products.length} Items Found
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                {data.ecommerce.products.map((prod, idx) => (
                  <div key={idx} className="p-3 border border-gray-200 rounded-lg flex items-start space-x-3">
                    {prod.imageUrl && (
                      <img
                        src={prod.imageUrl}
                        alt=""
                        className="w-12 h-12 rounded object-cover border border-gray-100 flex-shrink-0"
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      />
                    )}
                    <div className="text-xs min-w-0 flex-1">
                      <p className="font-semibold text-black truncate">{prod.name}</p>
                      {prod.price && (
                        <p className="text-[#81171B] font-mono font-medium">
                          {prod.currency || '$'}{prod.price}
                        </p>
                      )}
                      {prod.description && (
                        <p className="text-gray-500 line-clamp-1 mt-0.5">{prod.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
