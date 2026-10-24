import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Globe,
  ArrowRight,
  Sparkles,
  Search,
  FolderKanban,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Layers,
  Palette,
  FileText,
  Loader2,
  Copy,
  ExternalLink,
  Target,
  BarChart3,
  Check,
  TrendingUp,
  Cpu,
  Lock,
  Database,
  ArrowUpRight,
} from 'lucide-react';
import { BRAND_ASSETS } from '../lib/branding.ts';

interface LandingPageProps {
  onStartScan: (url: string) => void;
  isScanning: boolean;
}

const SAMPLE_URLS = [
  { label: 'Stripe', url: 'https://stripe.com', type: 'Fintech' },
  { label: 'Shopify', url: 'https://shopify.com', type: 'E-Commerce' },
  { label: 'Patagonia', url: 'https://patagonia.com', type: 'Outdoor Brand' },
  { label: 'Linear', url: 'https://linear.app', type: 'SaaS' },
];

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.08,
      duration: 0.24,
      ease: 'easeOut' as const,
    },
  }),
};

export function LandingPage({ onStartScan, isScanning }: LandingPageProps) {
  const [inputUrl, setInputUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError(null);

    const trimmed = inputUrl.trim();
    if (!trimmed) {
      setUrlError('Please enter a website URL.');
      return;
    }

    if (!trimmed.includes('.') || trimmed.length < 4) {
      setUrlError('Please enter a valid domain address (e.g., https://yourbusiness.com).');
      return;
    }

    onStartScan(trimmed);
  };

  const handleCopy = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex(null), 2000);
  };

  return (
    <div className="space-y-28">
      {/* HERO SECTION */}
      <section className="pt-12 sm:pt-20 pb-12 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto text-center space-y-8">
        {/* Subtle Brand Pill */}
        <motion.div
          custom={0}
          initial="hidden"
          animate="visible"
          variants={staggerItem}
          className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-[#fdf5f5] border border-[#f4dcd9] text-[#81171B] text-xs font-semibold tracking-wide shadow-xs"
        >
          <img
            src={BRAND_ASSETS.iconLogoSquare}
            alt="NexusMark"
            className="w-4 h-4 rounded-sm object-cover"
          />
          <span>Powered by Google Gemma 4 • Best Use of Gemma 4</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#81171B]" />
          <span className="text-[11px] font-medium text-[#540804]">Multimodal Intelligence</span>
        </motion.div>

        {/* Hero Headline */}
        <motion.h1
          custom={1}
          initial="hidden"
          animate="visible"
          variants={staggerItem}
          className="text-4xl sm:text-6xl lg:text-7xl font-extrabold text-black tracking-tight leading-[1.08] max-w-4xl mx-auto"
        >
          Your entire marketing team. <br />
          <span className="text-[#81171B]">One AI powered workspace.</span>
        </motion.h1>

        {/* Supporting Copy */}
        <motion.p
          custom={2}
          initial="hidden"
          animate="visible"
          variants={staggerItem}
          className="text-lg sm:text-xl text-gray-700 max-w-2xl mx-auto font-normal leading-relaxed"
        >
          Scan your website, understand your brand, uncover SEO opportunities, and build your marketing foundation in minutes.
        </motion.p>

        {/* Hero URL Input Form */}
        <motion.div
          custom={3}
          initial="hidden"
          animate="visible"
          variants={staggerItem}
          className="max-w-2xl mx-auto pt-2 space-y-3"
        >
          <form onSubmit={handleSubmit} className="space-y-2">
            <div className="flex flex-col sm:flex-row items-stretch gap-2 p-2 bg-white border-2 border-gray-200 focus-within:border-[#81171B] focus-within:ring-4 focus-within:ring-[#81171B]/5 rounded-2xl shadow-sm transition-all">
              <div className="flex items-center space-x-3 px-3.5 py-2.5 flex-1">
                <Globe className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <input
                  type="text"
                  value={inputUrl}
                  onChange={(e) => {
                    setInputUrl(e.target.value);
                    if (urlError) setUrlError(null);
                  }}
                  placeholder="https://yourbusiness.com"
                  aria-label="Enter your business website URL"
                  className="w-full text-base sm:text-sm text-black placeholder-gray-400 bg-transparent focus:outline-none font-medium"
                  disabled={isScanning}
                />
              </div>
              <button
                type="submit"
                disabled={isScanning}
                className="inline-flex items-center justify-center space-x-2 px-6 py-3.5 text-sm sm:text-base font-semibold text-white bg-[#81171B] hover:bg-[#540804] active:bg-[#540804] rounded-xl shadow-sm transition-all disabled:opacity-50 flex-shrink-0 cursor-pointer"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Scanning Website...</span>
                  </>
                ) : (
                  <>
                    <span>Analyze My Website</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

            {urlError && (
              <p className="text-xs text-red-600 font-semibold text-left px-2 flex items-center space-x-1.5">
                <span>✕</span>
                <span>{urlError}</span>
              </p>
            )}
          </form>

          {/* Quick-try sample chips */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs">
            <span className="text-gray-500 font-medium">Or try a sample URL:</span>
            {SAMPLE_URLS.map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => {
                  setInputUrl(sample.url);
                  onStartScan(sample.url);
                }}
                disabled={isScanning}
                className="inline-flex items-center space-x-1 px-2.5 py-1 bg-gray-50 hover:bg-[#fdf5f5] text-gray-700 hover:text-[#81171B] border border-gray-200 hover:border-[#f4dcd9] rounded-lg transition-colors cursor-pointer text-xs font-medium"
              >
                <span>{sample.label}</span>
                <span className="text-[10px] text-gray-400">({sample.type})</span>
              </button>
            ))}
          </div>

          {/* Safe fetch guarantee */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2 text-xs text-gray-500">
            <div className="flex items-center space-x-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Safe live website extraction</span>
            </div>
            <span>•</span>
            <div className="flex items-center space-x-1.5">
              <Lock className="w-3.5 h-3.5 text-gray-400" />
              <span>SSRF-protected engine</span>
            </div>
            <span>•</span>
            <div className="flex items-center space-x-1.5">
              <Database className="w-3.5 h-3.5 text-gray-400" />
              <span>Zero hallucination guarantee</span>
            </div>
          </div>
        </motion.div>

        {/* HIGH-FIDELITY PRODUCT INTERFACE PREVIEW */}
        <motion.div
          custom={4}
          initial="hidden"
          animate="visible"
          variants={staggerItem}
          className="pt-10 max-w-5xl mx-auto"
        >
          <div className="border border-gray-200 rounded-3xl p-4 sm:p-7 bg-white shadow-xl text-left space-y-6 relative overflow-hidden">
            {/* Top window controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-gray-100 text-xs">
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-400 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />
                </div>
                <div className="flex items-center space-x-2 bg-gray-50 px-3 py-1 rounded-md border border-gray-200 font-mono text-[11px] text-gray-600">
                  <Lock className="w-3 h-3 text-emerald-600" />
                  <span>https://nexusmark.platform/workspaces/acme-atelier</span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  <span>Live Extraction Active</span>
                </span>
                <span className="text-[11px] text-gray-400 hidden sm:inline">• Firestore Synced</span>
              </div>
            </div>

            {/* Dashboard Mockup Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Brand Intelligence Card (5 cols) */}
              <div className="lg:col-span-5 p-5 bg-gray-50/70 border border-gray-200 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-7 h-7 rounded-lg bg-[#81171B] text-white flex items-center justify-center font-bold text-xs">
                      AA
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-black">Acme Atelier</h4>
                      <p className="text-[11px] text-gray-500 font-mono">acmeatelier.com</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-200 text-gray-800">
                    B2B & Retail
                  </span>
                </div>

                {/* Color Ramp */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-gray-700 flex items-center gap-1">
                      <Palette className="w-3.5 h-3.5 text-[#81171B]" />
                      <span>Extracted CSS Palette</span>
                    </span>
                    <span className="text-[10px] text-gray-400">4 Declared</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    {[
                      { hex: '#81171B', name: 'Primary' },
                      { hex: '#540804', name: 'Maroon' },
                      { hex: '#FDF5F5', name: 'Surface' },
                      { hex: '#111827', name: 'Text' },
                    ].map((c) => (
                      <div
                        key={c.hex}
                        onClick={() => handleCopy(c.hex)}
                        className="group p-1.5 bg-white border border-gray-200 rounded-lg text-center cursor-pointer hover:border-[#81171B] transition-all"
                      >
                        <div
                          className="w-full h-7 rounded border border-gray-200 shadow-inner mb-1"
                          style={{ backgroundColor: c.hex }}
                        />
                        <p className="text-[10px] font-mono font-bold text-black group-hover:text-[#81171B]">
                          {copiedHex === c.hex ? 'Copied!' : c.hex}
                        </p>
                        <p className="text-[9px] text-gray-600">{c.name}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Typography Specimen */}
                <div className="p-3 bg-white border border-gray-200 rounded-xl space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Declared Typography</p>
                  <p className="text-xs font-semibold text-black flex items-center justify-between">
                    <span>Inter / Semi-Bold 600</span>
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 rounded">Google Fonts</span>
                  </p>
                  <p className="text-[11px] text-gray-600 leading-snug">
                    "Crafted for modern design systems and commercial clarity."
                  </p>
                </div>

                {/* Brand Voice Tags */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {['Authoritative', 'Minimalist', 'Direct-to-Consumer', 'Accessible'].map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 text-[10px] font-medium bg-white text-gray-700 rounded border border-gray-200"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* SEO Score & Audit Radial Gauge (4 cols) */}
              <div className="lg:col-span-4 p-5 bg-gray-50/70 border border-gray-200 rounded-2xl flex flex-col justify-between space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-black flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-[#81171B]" />
                    <span>SEO Opportunity Health</span>
                  </span>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                    92/100
                  </span>
                </div>

                {/* Radial Gauge SVG */}
                <div className="flex items-center justify-center py-2">
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      {/* Background circle */}
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        stroke="#e5e7eb"
                        strokeWidth="8"
                        fill="transparent"
                      />
                      {/* Active progress arc */}
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        stroke="#81171B"
                        strokeWidth="8"
                        strokeDasharray="251.2"
                        strokeDashoffset="25.1"
                        strokeLinecap="round"
                        fill="transparent"
                      />
                    </svg>
                    <div className="absolute text-center">
                      <span className="text-2xl font-black text-black">92%</span>
                      <p className="text-[9px] font-bold text-emerald-700 uppercase tracking-wide">Excellent</p>
                    </div>
                  </div>
                </div>

                {/* Sub-checks breakdown */}
                <div className="space-y-2 pt-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>H1 Heading Hierarchy</span>
                    </span>
                    <span className="font-bold text-black">100%</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-600 rounded-full w-full" />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-gray-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>Meta Descriptions & Length</span>
                    </span>
                    <span className="font-bold text-black">88%</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-[#81171B] rounded-full w-[88%]" />
                  </div>
                </div>
              </div>

              {/* Target Audience Persona & Actions (3 cols) */}
              <div className="lg:col-span-3 p-5 bg-gray-50/70 border border-gray-200 rounded-2xl flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-black flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-[#81171B]" />
                    <span>Audience Persona</span>
                  </span>
                  <div className="p-3 bg-white border border-gray-200 rounded-xl space-y-1">
                    <p className="text-xs font-bold text-black">Creative Brand Directors</p>
                    <p className="text-[11px] text-gray-500 leading-snug">
                      Seeking high-velocity marketing execution without compromising design aesthetic.
                    </p>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-gray-200">
                  <div className="flex items-center justify-between text-xs font-semibold text-black">
                    <span>Marketing Opportunities</span>
                    <span className="text-[#81171B] text-[11px]">3 Found</span>
                  </div>
                  <div className="p-2.5 bg-white border border-gray-200 rounded-lg text-[11px] text-gray-700 flex items-center justify-between">
                    <span>Search Title Tag Polish</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold">
                      Quick Win
                    </span>
                  </div>
                  <div className="p-2.5 bg-white border border-gray-200 rounded-lg text-[11px] text-gray-700 flex items-center justify-between">
                    <span>Social Media Pillars</span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[9px] font-bold">
                      High Impact
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* HOW IT WORKS - 3 STEP INTERACTIVE GUIDE */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-semibold">
            <span>Seamless Workflow</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-black tracking-tight">
            From website URL to complete marketing foundation in 3 steps
          </h2>
          <p className="text-gray-600 text-sm sm:text-base max-w-xl mx-auto">
            Zero complex setups. Enter your address, inspect authentic extraction facts, and save your workspace.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Step 1 */}
          <div className="bg-white border-2 border-gray-100 hover:border-[#81171B]/30 rounded-3xl p-7 space-y-5 shadow-sm transition-all relative group">
            <div className="w-12 h-12 rounded-2xl bg-[#fdf5f5] text-[#81171B] flex items-center justify-center font-black text-lg border border-[#f4dcd9]">
              1
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-black">Enter your website</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Provide your public website URL. Our SSRF-safe crawling engine discovers internal pages, reads public metadata, and extracts raw page content without executing dangerous client scripts.
              </p>
            </div>
            <div className="pt-2 border-t border-gray-100 flex items-center space-x-2 text-xs text-gray-500 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Safe live HTTP fetch</span>
            </div>
          </div>

          {/* Step 2 */}
          <div className="bg-white border-2 border-gray-100 hover:border-[#81171B]/30 rounded-3xl p-7 space-y-5 shadow-sm transition-all relative group">
            <div className="w-12 h-12 rounded-2xl bg-[#fdf5f5] text-[#81171B] flex items-center justify-center font-black text-lg border border-[#f4dcd9]">
              2
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-black">Discover your brand insights</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Cheerio and the server-side Gemini API analyze your actual color palettes, fonts, product catalog, SEO health, and audience hypotheses—never fabricating imaginary business data.
              </p>
            </div>
            <div className="pt-2 border-t border-gray-100 flex items-center space-x-2 text-xs text-gray-500 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Gemini 3.8 Flash structured schemas</span>
            </div>
          </div>

          {/* Step 3 */}
          <div className="bg-white border-2 border-gray-100 hover:border-[#81171B]/30 rounded-3xl p-7 space-y-5 shadow-sm transition-all relative group">
            <div className="w-12 h-12 rounded-2xl bg-[#fdf5f5] text-[#81171B] flex items-center justify-center font-black text-lg border border-[#f4dcd9]">
              3
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-black">Create your marketing workspace</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Confirm your auto-suggested workspace name and save your brand profile to secure Cloud Firestore storage, ready for ongoing rescans and future marketing execution.
              </p>
            </div>
            <div className="pt-2 border-t border-gray-100 flex items-center space-x-2 text-xs text-gray-500 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Isolated Firestore persistence</span>
            </div>
          </div>
        </div>
      </section>

      {/* THREE CORE PRODUCT PILLARS WITH RICH VISUALS */}
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-16">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#fdf5f5] text-[#81171B] text-xs font-semibold">
            <span>Enterprise Architecture</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-black tracking-tight">
            Engineered for precision, clarity, and real marketing results
          </h2>
          <p className="text-gray-600 text-sm sm:text-base max-w-xl mx-auto">
            Every feature is backed by real server-side infrastructure and rigorous security standards.
          </p>
        </div>

        {/* Feature 1: Brand Intelligence */}
        <div id="brand-intelligence" className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            <div className="w-12 h-12 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center text-[#81171B] shadow-xs">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#81171B]">Verified Facts & Positioning</span>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-black">
                Brand Intelligence
              </h3>
            </div>
            <p className="text-gray-700 text-sm sm:text-base leading-relaxed">
              Understand your business, visual identity, products, audience, and website SEO. We separate verified facts from AI-derived recommendations so you stay in complete control.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                <p className="text-xs font-bold text-black flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Extracted CSS Palette</span>
                </p>
                <p className="text-[11px] text-gray-500">Hex values from stylesheets with contrast rating.</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                <p className="text-xs font-bold text-black flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Audience Personas</span>
                </p>
                <p className="text-[11px] text-gray-500">Explicitly marked as hypotheses based on real copy.</p>
              </div>
            </div>
          </div>

          {/* Visual Element for Brand Intelligence */}
          <div className="p-6 bg-white border border-gray-200 rounded-3xl shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 text-xs">
              <span className="font-bold text-black flex items-center gap-1.5">
                <Palette className="w-4 h-4 text-[#81171B]" />
                <span>Extracted Brand DNA Matrix</span>
              </span>
              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold text-[10px]">
                100% Verified
              </span>
            </div>
            <div className="space-y-3">
              <div className="p-3 bg-gray-50 rounded-xl space-y-1.5">
                <p className="text-xs font-semibold text-black">Tone & Voice Profile</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-2 py-0.5 bg-white text-xs font-medium text-gray-800 rounded border border-gray-200">
                    Direct
                  </span>
                  <span className="px-2 py-0.5 bg-white text-xs font-medium text-gray-800 rounded border border-gray-200">
                    Design-Led
                  </span>
                  <span className="px-2 py-0.5 bg-white text-xs font-medium text-gray-800 rounded border border-gray-200">
                    Transparent
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-emerald-50/60 border border-emerald-200 rounded-lg space-y-1">
                  <p className="font-bold text-emerald-900 text-[11px]">Brand Do's</p>
                  <p className="text-[10px] text-emerald-800">Clear benefit statements, high-contrast typography.</p>
                </div>
                <div className="p-2.5 bg-rose-50/60 border border-rose-200 rounded-lg space-y-1">
                  <p className="font-bold text-rose-900 text-[11px]">Brand Don'ts</p>
                  <p className="text-[10px] text-rose-800">Unsubstantiated claims, opaque jargon.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature 2: AI Marketing */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          {/* Visual Element for AI Marketing */}
          <div className="order-2 lg:order-1 p-6 bg-white border border-gray-200 rounded-3xl shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 text-xs">
              <span className="font-bold text-black flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-[#81171B]" />
                <span>AI Campaign Themes & Strategy</span>
              </span>
              <span className="text-[#81171B] bg-[#fdf5f5] px-2 py-0.5 rounded font-semibold text-[10px]">
                Zod Validated
              </span>
            </div>
            <div className="space-y-3">
              <div className="p-3 bg-gray-50 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-black">Educational Authority Series</p>
                  <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded">
                    High Impact
                  </span>
                </div>
                <p className="text-[11px] text-gray-600">
                  Highlighting the top 3 friction points in your industry and our solutions.
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-black">Product Launch Teaser</p>
                  <span className="text-[10px] font-semibold text-blue-800 bg-blue-100 px-1.5 py-0.2 rounded">
                    Quick Win
                  </span>
                </div>
                <p className="text-[11px] text-gray-600">
                  Showcasing core product capabilities through authentic behind-the-scenes angles.
                </p>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2 space-y-6">
            <div className="w-12 h-12 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center text-[#81171B] shadow-xs">
              <Zap className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#81171B]">Strategic Campaign Engine</span>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-black">
                AI Marketing
              </h3>
            </div>
            <p className="text-gray-700 text-sm sm:text-base leading-relaxed">
              Turn brand insights into marketing strategies, social media plans, and branded content. Tailored for your specific industry subcategory and business model.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                <p className="text-xs font-bold text-black flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Actionable Priorities</span>
                </p>
                <p className="text-[11px] text-gray-500">Sorted by impact and implementation effort.</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                <p className="text-xs font-bold text-black flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Content Angles</span>
                </p>
                <p className="text-[11px] text-gray-500">Pre-constructed hooks for social and email channels.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Feature 3: Marketing Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            <div className="w-12 h-12 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center text-[#81171B] shadow-xs">
              <FolderKanban className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#81171B]">Persistent Multi-Brand Hub</span>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-black">
                Marketing Workspace
              </h3>
            </div>
            <p className="text-gray-700 text-sm sm:text-base leading-relaxed">
              Keep brand information, campaign assets, and marketing activity organized in one place. Isolated per-workspace data with persistent Cloud Firestore storage.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                <p className="text-xs font-bold text-black flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Workspace Switcher</span>
                </p>
                <p className="text-[11px] text-gray-500">Manage separate business profiles cleanly.</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                <p className="text-xs font-bold text-black flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Full Rescan History</span>
                </p>
                <p className="text-[11px] text-gray-500">Preserve audit history and track changes over time.</p>
              </div>
            </div>
          </div>

          {/* Visual Element for Workspace */}
          <div className="p-6 bg-white border border-gray-200 rounded-3xl shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 text-xs">
              <span className="font-bold text-black flex items-center gap-1.5">
                <Database className="w-4 h-4 text-[#81171B]" />
                <span>Firestore Document Collections</span>
              </span>
              <span className="text-gray-500 text-[10px]">Strict ABAC Security</span>
            </div>
            <div className="space-y-2 text-xs font-mono">
              <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between">
                <span className="text-black font-semibold">/workspaces/{'{workspaceId}'}</span>
                <span className="text-[10px] text-emerald-700 font-sans font-semibold">Owner Verified</span>
              </div>
              <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between">
                <span className="text-black font-semibold">/brandProfiles/{'{profileId}'}</span>
                <span className="text-[10px] text-emerald-700 font-sans font-semibold">Isolated</span>
              </div>
              <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between">
                <span className="text-black font-semibold">/websiteScans/{'{scanId}'}</span>
                <span className="text-[10px] text-emerald-700 font-sans font-semibold">Historical Logs</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CALL TO ACTION */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-[#fdf5f5] border border-[#f4dcd9] rounded-3xl p-8 sm:p-14 text-center space-y-6 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-[#81171B] text-white flex items-center justify-center mx-auto font-bold shadow-sm">
            NM
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-black tracking-tight">
            Ready to establish your AI marketing foundation?
          </h2>
          <p className="text-sm sm:text-base text-gray-700 max-w-xl mx-auto leading-relaxed">
            Scan your website now to inspect real brand DNA, verify your SEO health, and create your dedicated marketing workspace.
          </p>
          <div className="pt-2">
            <button
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="inline-flex items-center space-x-2 px-7 py-3.5 text-sm sm:text-base font-semibold text-white bg-[#81171B] hover:bg-[#540804] active:bg-[#540804] rounded-xl shadow-sm transition-colors cursor-pointer"
            >
              <span>Analyze Your Website</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
