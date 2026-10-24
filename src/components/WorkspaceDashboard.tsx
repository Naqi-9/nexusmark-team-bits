import { authenticatedFetch } from '../lib/firebase.ts';
import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Sparkles,
  Search,
  ShoppingBag,
  Settings,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  Plus,
  Edit2,
  Check,
  CheckCircle2,
  AlertTriangle,
  Info,
  Layers,
  Users,
  Palette,
  Share2,
  Calendar,
  Clock,
  Menu,
  X,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Copy,
  Bot,
  Zap,
  Target,
  BarChart2,
  Eye,
  PenTool,
  CalendarDays,
  Library,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  WorkspaceRecord,
  loadWorkspaceDetails,
  updateWorkspaceName,
  applyRescanToWorkspace,
  BrandProfileRecord,
  SeoAuditRecord,
  ProductRecord,
  WebsiteScanRecord,
  DeliverableRecord,
  fetchDeliverables,
  regenerateWorkspaceScreenshot,
} from '../services/workspaceService.ts';
import { BrandLogo } from './BrandLogo.tsx';
import { WebsiteSnapshotCard } from './WebsiteSnapshotCard.tsx';
import { MarketingStrategist } from './MarketingStrategist.tsx';
import { DeliverablesViewer } from './DeliverablesViewer.tsx';
import { BRAND_ASSETS } from '../lib/branding.ts';
import { ContentStudio } from './content/ContentStudio.tsx';
import { ContentCalendar } from './content/ContentCalendar.tsx';
import { ContentLibrary } from './content/ContentLibrary.tsx';
import type { ContentItemRecord } from '../lib/contentTypes.ts';

interface WorkspaceDashboardProps {
  currentWorkspaceId: string;
  allWorkspaces: WorkspaceRecord[];
  onSelectWorkspace: (id: string) => void;
  onCreateNewWorkspace: () => void;
}

type TabType =
  | 'overview' | 'brand_dna' | 'strategist' | 'content_studio' | 'content_calendar' | 'content_library'
  | 'deliverables' | 'seo_audit' | 'products' | 'settings';

export function WorkspaceDashboard({
  currentWorkspaceId,
  allWorkspaces,
  onSelectWorkspace,
  onCreateNewWorkspace,
}: WorkspaceDashboardProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [studioSeed, setStudioSeed] = useState<ContentItemRecord | null>(null);
  const [studioSeedMagic, setStudioSeedMagic] = useState(false);
  const openInStudio = useCallback((item: ContentItemRecord, opts?: { magic?: boolean }) => {
    setStudioSeed(item);
    setStudioSeedMagic(Boolean(opts?.magic));
    setActiveTab('content_studio');
  }, []);
  const clearStudioSeed = useCallback(() => { setStudioSeed(null); setStudioSeedMagic(false); }, []);
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceRecord | null>(null);
  const [brandProfile, setBrandProfile] = useState<BrandProfileRecord | null>(null);
  const [seoAudit, setSeoAudit] = useState<SeoAuditRecord | null>(null);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [scans, setScans] = useState<WebsiteScanRecord[]>([]);
  const [deliverables, setDeliverables] = useState<DeliverableRecord[]>([]);

  // Workspace Switcher dropdown & Mobile drawer
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Rename modal / inline
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [renaming, setRenaming] = useState(false);

  // Rescan state
  const [rescanning, setRescanning] = useState(false);
  const [rescanError, setRescanError] = useState<string | null>(null);
  const [rescanSuccess, setRescanSuccess] = useState(false);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [regeneratingScreenshot, setRegeneratingScreenshot] = useState(false);

  const handleCopy = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex(null), 2000);
  };

  const handleRegenerateScreenshot = async () => {
    if (!workspace) return;
    setRegeneratingScreenshot(true);
    try {
      const updated = await regenerateWorkspaceScreenshot({
        workspaceId: workspace.id,
        websiteUrl: workspace.websiteUrl,
      });

      if (updated.screenshotStatus === 'captured' && updated.websiteScreenshotUrl) {
        setWorkspace(prev =>
          prev
            ? {
                ...prev,
                websiteScreenshotUrl: updated.websiteScreenshotUrl,
                mobileScreenshotUrl: updated.mobileScreenshotUrl,
                ogImageUrl: updated.ogImageUrl,
                screenshotUrl: updated.websiteScreenshotUrl,
                screenshotStatus: 'captured',
                screenshotCapturedAt: updated.screenshotCapturedAt,
              }
            : null
        );

        setBrandProfile(prev =>
          prev
            ? {
                ...prev,
                websiteScreenshotUrl: updated.websiteScreenshotUrl,
                mobileScreenshotUrl: updated.mobileScreenshotUrl,
                ogImageUrl: updated.ogImageUrl,
                screenshotUrl: updated.websiteScreenshotUrl,
                screenshotStatus: 'captured',
                screenshotCapturedAt: updated.screenshotCapturedAt,
              }
            : null
        );
      }
    } catch (err) {
      console.warn('[WorkspaceDashboard] Screenshot recapture warning:', err);
    } finally {
      setRegeneratingScreenshot(false);
    }
  };

  // Load Workspace data
  const loadData = async () => {
    try {
      const bundle = await loadWorkspaceDetails(currentWorkspaceId);
      if (bundle) {
        setWorkspace(bundle.workspace);
        setNameInput(bundle.workspace.name);
        setBrandProfile(bundle.brandProfile);
        setSeoAudit(bundle.seoAudit);
        setProducts(bundle.products);
        setScans(bundle.scans);
        setDeliverables(bundle.deliverables || []);
      }
    } catch (err) {
      console.error('Failed to load workspace data:', err);
    }
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    loadData().finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [currentWorkspaceId]);

  const refreshDeliverables = async () => {
    try {
      const updated = await fetchDeliverables(currentWorkspaceId);
      setDeliverables(updated);
    } catch (err) {
      console.error('Failed to refresh deliverables:', err);
    }
  };

  // Rename Workspace
  const handleRename = async () => {
    if (!nameInput.trim() || !workspace) return;
    setRenaming(true);
    try {
      await updateWorkspaceName(workspace.id, nameInput.trim());
      setWorkspace({ ...workspace, name: nameInput.trim() });
      setIsEditingName(false);
    } catch (err) {
      console.error('Failed to rename workspace:', err);
    } finally {
      setRenaming(false);
    }
  };

  // Perform Website Rescan
  const handleRescan = async () => {
    if (!workspace || !user) return;
    setRescanning(true);
    setRescanError(null);
    setRescanSuccess(false);

    try {
      const response = await authenticatedFetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: workspace.websiteUrl }),
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || 'Rescan request failed.');
      }

      const scanResult = await response.json();

      // Persist rescan in Firestore
      await applyRescanToWorkspace({
        userId: user.uid,
        workspaceId: workspace.id,
        sourceUrl: workspace.websiteUrl,
        scanData: {
          scanId: scanResult.scanId,
          extracted: {
            url: scanResult.sourceUrl,
            businessIdentity: scanResult.businessIdentity,
            visualIdentity: scanResult.visualIdentity,
            businessInfo: scanResult.businessInfo,
            seo: scanResult.seo,
            ecommerce: scanResult.ecommerce,
            snapshot: scanResult.snapshot || {
              screenshotUrl: null,
              screenshotStatus: 'unavailable',
              screenshotCapturedAt: new Date().toISOString(),
              previewImageUrl: null,
            },
          },
          aiAnalysis: scanResult.aiAnalysis,
          scannedUrls: scanResult.scannedUrls,
          pagesScanned: scanResult.pagesScanned,
        },
      });

      // Reload fresh workspace bundle
      await loadData();

      setRescanSuccess(true);
      setTimeout(() => setRescanSuccess(false), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Rescan failed';
      setRescanError(msg);
    } finally {
      setRescanning(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-[#81171B] animate-spin" />
        <p className="text-sm text-gray-500 font-medium">Loading your marketing workspace...</p>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 bg-white border border-gray-200 rounded-xl text-center space-y-4">
        <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
        <h3 className="text-lg font-bold text-black">Workspace Not Found</h3>
        <p className="text-sm text-gray-600">The requested workspace could not be loaded or you do not have permission to view it.</p>
        <button
          onClick={onCreateNewWorkspace}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-[#81171B] text-white text-sm font-semibold rounded-lg"
        >
          <Plus className="w-4 h-4" />
          <span>Create a Workspace</span>
        </button>
      </div>
    );
  }

  // SEO statistics
  const issues = seoAudit?.issues || [];
  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const passedCount = issues.filter(i => i.severity === 'good').length;

  const modelUsed = brandProfile?.modelAttribution?.modelUsed || 'Attribution unavailable';
  const isMultimodal = Boolean(brandProfile?.modelAttribution?.isMultimodal);

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col font-sans">
      {/* Top Bar with Workspace Switcher & Actions */}
      <div className="bg-white border-b border-gray-200 sticky top-16 z-30 px-4 sm:px-6 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Workspace Selector */}
          <div className="relative">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setMobileDrawerOpen(true)}
                className="md:hidden p-1.5 text-gray-600 hover:text-black hover:bg-gray-100 rounded-md"
                aria-label="Open sidebar"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="relative">
                <button
                  onClick={() => setSwitcherOpen(!switcherOpen)}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-xs font-semibold text-black transition-colors"
                >
                  <span className="truncate max-w-[200px]">{workspace.name}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                </button>

                {switcherOpen && (
                  <div className="absolute left-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1.5">
                    <div className="px-3 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      Workspaces
                    </div>
                    {allWorkspaces.map(ws => (
                      <button
                        key={ws.id}
                        onClick={() => {
                          onSelectWorkspace(ws.id);
                          setSwitcherOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-gray-50 ${
                          ws.id === workspace.id ? 'font-bold text-[#81171B] bg-red-50/50' : 'text-gray-700'
                        }`}
                      >
                        <span className="truncate">{ws.name}</span>
                        {ws.id === workspace.id && <Check className="w-3.5 h-3.5 text-[#81171B]" />}
                      </button>
                    ))}
                    <div className="border-t border-gray-100 mt-1 pt-1">
                      <button
                        onClick={() => {
                          setSwitcherOpen(false);
                          onCreateNewWorkspace();
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-[#81171B] font-semibold hover:bg-red-50/50 flex items-center space-x-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Scan New Website</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setIsEditingName(true)}
                className="p-1.5 text-gray-400 hover:text-black transition-colors"
                title="Rename workspace"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {isEditingName && (
              <div className="absolute top-12 left-0 z-40 bg-white p-2.5 border border-gray-300 rounded-lg shadow-md flex items-center space-x-2">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#81171B]"
                  autoFocus
                />
                <button
                  onClick={handleRename}
                  disabled={renaming}
                  className="px-2.5 py-1 bg-[#81171B] text-white text-xs font-medium rounded hover:bg-[#540804]"
                >
                  {renaming ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setIsEditingName(false)}
                  className="px-2 py-1 text-gray-500 text-xs hover:text-black"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Quick Actions Bar */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Gemma 4 Model Attribution Chip */}
            <div className="hidden lg:flex items-center space-x-1.5 px-3 py-1 bg-gray-50 border border-gray-200 rounded-full text-xs font-medium text-gray-700">
              <Bot className="w-3.5 h-3.5 text-[#81171B]" />
              <span>Gemma 4</span>
              <span className="text-gray-400 font-mono text-[10px]">({modelUsed})</span>
            </div>

            <a
              href={workspace.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors"
            >
              <span>Visit Website</span>
              <ExternalLink className="w-3 h-3 text-gray-500" />
            </a>

            <button
              onClick={handleRescan}
              disabled={rescanning}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#81171B] hover:bg-[#540804] active:bg-[#540804] rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${rescanning ? 'animate-spin' : ''}`} />
              <span>{rescanning ? 'Rescanning Website...' : 'Rescan Website'}</span>
            </button>
          </div>
        </div>

        {/* Rescan Notification Banner */}
        {rescanSuccess && (
          <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800 flex items-center space-x-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Website rescanned successfully! Latest brand DNA and Gemma 4 multimodal analysis updated.</span>
          </div>
        )}
        {rescanError && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800 flex items-center space-x-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
            <span>{rescanError}</span>
          </div>
        )}
      </div>

      {/* Main Workspace Body */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full flex flex-col md:flex-row gap-8">
        {/* Desktop Sidebar */}
        <aside className="hidden md:block w-64 shrink-0 space-y-1">
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                activeTab === 'overview'
                  ? 'bg-[#81171B] text-white shadow-sm'
                  : 'text-gray-700 hover:text-black hover:bg-gray-100'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('strategist')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                activeTab === 'strategist'
                  ? 'bg-[#81171B] text-white shadow-sm'
                  : 'text-gray-700 hover:text-black hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Bot className="w-4 h-4" />
                <span>AI Strategist</span>
              </div>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === 'strategist' ? 'bg-white text-[#81171B]' : 'bg-red-50 text-[#81171B] border border-[#f4dcd9]'
              }`}>
                Gemma 4
              </span>
            </button>

            <button
              onClick={() => setActiveTab('deliverables')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                activeTab === 'deliverables'
                  ? 'bg-[#81171B] text-white shadow-sm'
                  : 'text-gray-700 hover:text-black hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Calendar className="w-4 h-4" />
                <span>Deliverables Studio</span>
              </div>
              {deliverables.length > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  activeTab === 'deliverables' ? 'bg-white text-[#81171B]' : 'bg-gray-200 text-gray-800'
                }`}>
                  {deliverables.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('content_studio')}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                activeTab === 'content_studio'
                  ? 'bg-[#81171B] text-white shadow-sm'
                  : 'text-gray-700 hover:text-black hover:bg-gray-100'
              }`}
            >
              <PenTool className="w-4 h-4" />
              <span>Content Studio</span>
            </button>

            <button
              onClick={() => setActiveTab('content_calendar')}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                activeTab === 'content_calendar'
                  ? 'bg-[#81171B] text-white shadow-sm'
                  : 'text-gray-700 hover:text-black hover:bg-gray-100'
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              <span>Content Calendar</span>
            </button>

            <button
              onClick={() => setActiveTab('content_library')}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                activeTab === 'content_library'
                  ? 'bg-[#81171B] text-white shadow-sm'
                  : 'text-gray-700 hover:text-black hover:bg-gray-100'
              }`}
            >
              <Library className="w-4 h-4" />
              <span>Content Library</span>
            </button>

            <button
              onClick={() => setActiveTab('brand_dna')}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                activeTab === 'brand_dna'
                  ? 'bg-[#81171B] text-white shadow-sm'
                  : 'text-gray-700 hover:text-black hover:bg-gray-100'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Brand DNA</span>
            </button>

            <button
              onClick={() => setActiveTab('seo_audit')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                activeTab === 'seo_audit'
                  ? 'bg-[#81171B] text-white shadow-sm'
                  : 'text-gray-700 hover:text-black hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Search className="w-4 h-4" />
                <span>Website Audit</span>
              </div>
              {criticalCount > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === 'seo_audit' ? 'bg-white text-[#81171B]' : 'bg-red-100 text-red-800'}`}>
                  {criticalCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('products')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                activeTab === 'products'
                  ? 'bg-[#81171B] text-white shadow-sm'
                  : 'text-gray-700 hover:text-black hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center space-x-3">
                <ShoppingBag className="w-4 h-4" />
                <span>Products & Catalog</span>
              </div>
              {products.length > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === 'products' ? 'bg-white text-[#81171B]' : 'bg-gray-200 text-gray-800'}`}>
                  {products.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                activeTab === 'settings'
                  ? 'bg-[#81171B] text-white shadow-sm'
                  : 'text-gray-700 hover:text-black hover:bg-gray-100'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Settings & History</span>
            </button>
          </nav>
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs md:hidden flex">
            <div className="w-64 bg-white p-6 space-y-4 flex flex-col justify-between shadow-xl">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                  <img
                    src={BRAND_ASSETS.fullNameLogoLandscape}
                    alt="NexusMark"
                    className="h-7 w-auto object-contain rounded"
                  />
                  <button onClick={() => setMobileDrawerOpen(false)} className="text-gray-400 hover:text-black">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <nav className="space-y-1 pt-4">
                  {(['overview', 'strategist', 'content_studio', 'content_calendar', 'content_library', 'deliverables', 'brand_dna', 'seo_audit', 'products', 'settings'] as TabType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => {
                        setActiveTab(t);
                        setMobileDrawerOpen(false);
                      }}
                      className={`w-full flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-lg capitalize ${
                        activeTab === t ? 'bg-[#81171B] text-white' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <span>{t.replace('_', ' ')}</span>
                    </button>
                  ))}
                </nav>
              </div>
              <button
                onClick={() => {
                  setMobileDrawerOpen(false);
                  onCreateNewWorkspace();
                }}
                className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-xs font-semibold text-white bg-[#81171B] rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Workspace</span>
              </button>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 min-w-0">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Top Overview Card */}
              <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center space-x-4">
                    <BrandLogo
                      logoUrl={workspace.logoUrl || brandProfile?.logoUrl}
                      businessName={brandProfile?.businessName || workspace.name}
                      size="lg"
                    />
                    <div>
                      <h2 className="text-xl sm:text-2xl font-bold text-black">
                        {brandProfile?.businessName || workspace.name}
                      </h2>
                      <p className="text-xs font-mono text-gray-500 mt-1">{workspace.websiteUrl}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                      Active Workspace
                    </span>
                    <span className="text-xs text-gray-500">
                      {scans.length} {scans.length === 1 ? 'Scan' : 'Scans'} on record
                    </span>
                  </div>
                </div>

                <p className="text-sm text-gray-700 leading-relaxed max-w-3xl">
                  {brandProfile?.businessDescription || 'Comprehensive marketing foundation extracted from verified website facts.'}
                </p>

                {/* Extracted Color Swatches Quick Row */}
                {brandProfile?.visualIdentity?.colors && brandProfile.visualIdentity.colors.length > 0 && (
                  <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center gap-3">
                    <span className="text-xs font-semibold text-gray-500">Identified Palette:</span>
                    <div className="flex items-center space-x-2">
                      {brandProfile.visualIdentity.colors.map((c, i) => (
                        <div
                          key={i}
                          className="w-6 h-6 rounded-md border border-gray-200 shadow-xs cursor-pointer hover:scale-110 transition-transform"
                          style={{ backgroundColor: c.hex }}
                          title={`${c.hex} (${c.role || 'detected'}) - click to copy`}
                          onClick={() => handleCopy(c.hex)}
                        />
                      ))}
                    </div>
                    {copiedHex && (
                      <span className="text-xs text-emerald-600 font-semibold">Copied {copiedHex}!</span>
                    )}
                  </div>
                )}
              </div>

              {/* Multimodal Brand Intelligence Signature Banner */}
              <div className="bg-gradient-to-br from-white to-[#fdf8f8] border border-[#f4dcd9] rounded-2xl p-6 sm:p-7 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#f4dcd9]">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-[#81171B] text-white flex items-center justify-center shadow-xs">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-base font-bold text-black">Multimodal Brand Intelligence</h3>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-[#81171B]">
                          Gemma 4 Signature Feature
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">
                        Synthesizing DOM architecture, CSS variables, and visual screenshot perception
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-xs">
                    <div className="flex items-center space-x-1.5 px-3 py-1 bg-white border border-gray-200 rounded-full font-mono text-[11px]">
                      <Bot className="w-3.5 h-3.5 text-[#81171B]" />
                      <span>{modelUsed}</span>
                    </div>
                    {isMultimodal ? (
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

                {/* Discrepancy & Visual Language Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Visual vs Copy Discrepancy Card */}
                  <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                        <Eye className="w-4 h-4 text-[#81171B]" />
                        Visual vs Copy Harmony
                      </span>
                      <span className="text-xs font-bold text-black bg-gray-100 px-2 py-0.5 rounded-md">
                        Score: {brandProfile?.visualVsMessagingDiscrepancies?.alignmentScore ?? 88}/100
                      </span>
                    </div>

                    <p className="text-xs text-gray-700 leading-relaxed">
                      {brandProfile?.visualVsMessagingDiscrepancies?.notes ||
                        'Visual styling and written copy show solid cohesion with clear market alignment.'}
                    </p>

                    {brandProfile?.visualVsMessagingDiscrepancies?.discrepancyList &&
                      brandProfile.visualVsMessagingDiscrepancies.discrepancyList.length > 0 && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1">
                          <span className="font-semibold text-amber-900">Observed Inconsistencies:</span>
                          <ul className="list-disc list-inside text-amber-800 space-y-0.5">
                            {brandProfile.visualVsMessagingDiscrepancies.discrepancyList.map((d, i) => (
                              <li key={i}>{d}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </div>

                  {/* Visual Design Language */}
                  <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-2xs space-y-3">
                    <span className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Palette className="w-4 h-4 text-[#81171B]" />
                      Observed Visual Design Language
                    </span>

                    <div className="space-y-1.5 text-xs text-gray-700">
                      <div>
                        <span className="font-semibold text-black">Aesthetic: </span>
                        <span>{brandProfile?.visualIdentityDesignLanguage?.overallAesthetic || 'Clean, modern digital interface with structured typography.'}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-black">Atmosphere: </span>
                        <span>{brandProfile?.visualIdentityDesignLanguage?.colorAtmosphere || 'Anchored by primary brand color accents.'}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-black">Typography: </span>
                        <span>{brandProfile?.visualIdentityDesignLanguage?.typographyFeel || 'Modern sans-serif typography with high legibility.'}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-black">Density: </span>
                        <span>{brandProfile?.visualIdentityDesignLanguage?.layoutDensity || 'Balanced viewport presence with clear content sections.'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Top 3 Priority Marketing Actions */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Target className="w-4 h-4 text-[#81171B]" />
                      Top 3 Priority Marketing Actions
                    </span>
                    <button
                      onClick={() => setActiveTab('strategist')}
                      className="text-xs font-semibold text-[#81171B] hover:underline inline-flex items-center space-x-1"
                    >
                      <span>Execute with AI Strategist</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(brandProfile?.top3PriorityActions || []).map((action, idx) => (
                      <div
                        key={idx}
                        className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs space-y-2 flex flex-col justify-between"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="w-5 h-5 rounded-full bg-[#81171B] text-white text-[10px] font-bold flex items-center justify-center">
                              {action.priority || idx + 1}
                            </span>
                            <div className="flex items-center space-x-1">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                {action.impact} Impact
                              </span>
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                                {action.effort}
                              </span>
                            </div>
                          </div>
                          <h4 className="text-xs font-bold text-black">{action.title}</h4>
                          <p className="text-[11px] text-gray-600 leading-relaxed">{action.actionableSteps}</p>
                        </div>
                        <span className="text-[10px] font-semibold text-gray-400 uppercase pt-2 border-t border-gray-100">
                          {action.category}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Metric Cards Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">SEO Health</span>
                    <div className="p-1.5 rounded-lg bg-[#fdf5f5] text-[#81171B]">
                      <Search className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-black">
                      {passedCount}/{issues.length} Passed
                    </p>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2">
                      <div
                        className="h-full bg-[#81171B] rounded-full transition-all"
                        style={{ width: `${Math.round((passedCount / (issues.length || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-600">
                    {criticalCount > 0 ? `${criticalCount} critical issues detected` : 'No critical SEO blocks found'}
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Audience Profiles</span>
                    <div className="p-1.5 rounded-lg bg-[#fdf5f5] text-[#81171B]">
                      <Users className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-black">
                      {brandProfile?.targetAudienceHypotheses?.length || 0} Personas
                    </p>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2">
                      <div className="h-full bg-emerald-600 rounded-full w-full" />
                    </div>
                  </div>
                  <p className="text-xs text-gray-600">Grounded in actual site positioning</p>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Deliverables</span>
                    <div className="p-1.5 rounded-lg bg-[#fdf5f5] text-[#81171B]">
                      <Calendar className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-black">
                      {deliverables.length} Created
                    </p>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2">
                      <div className="h-full bg-[#81171B] rounded-full w-3/4" />
                    </div>
                  </div>
                  <p className="text-xs text-gray-600">Content calendars, ads & roadmaps</p>
                </div>
              </div>

              {/* Snapshot Card & Recommendations */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Website Snapshot */}
                <div className="lg:col-span-1">
                  <WebsiteSnapshotCard
                    websiteScreenshotUrl={
                      workspace.websiteScreenshotUrl ||
                      brandProfile?.websiteScreenshotUrl ||
                      workspace.screenshotUrl ||
                      brandProfile?.screenshotUrl
                    }
                    mobileScreenshotUrl={workspace.mobileScreenshotUrl || brandProfile?.mobileScreenshotUrl}
                    ogImageUrl={workspace.ogImageUrl || brandProfile?.ogImageUrl}
                    screenshotUrl={workspace.screenshotUrl || brandProfile?.screenshotUrl}
                    previewImageUrl={brandProfile?.previewImageUrl}
                    screenshotStatus={
                      workspace.screenshotStatus ||
                      brandProfile?.screenshotStatus ||
                      (workspace.screenshotUrl || brandProfile?.screenshotUrl ? 'captured' : 'unavailable')
                    }
                    screenshotCapturedAt={workspace.screenshotCapturedAt || brandProfile?.screenshotCapturedAt}
                    sourceUrl={workspace.websiteUrl}
                    businessName={brandProfile?.businessName || workspace.name}
                    logoUrl={workspace.logoUrl || brandProfile?.logoUrl}
                    onRegenerateScreenshot={handleRegenerateScreenshot}
                    isRegenerating={regeneratingScreenshot}
                  />
                </div>

                {/* Recommended Channels & SEO Quick Preview */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Recommended Marketing Channels */}
                  <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                      <h3 className="text-sm font-bold text-black uppercase tracking-wider">
                        Recommended Marketing Channels
                      </h3>
                      <button
                        onClick={() => setActiveTab('strategist')}
                        className="text-xs text-[#81171B] hover:underline font-medium"
                      >
                        Plan Strategy
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(brandProfile?.recommendedChannels || [
                        { platform: 'LinkedIn', rationale: 'B2B authority and direct commercial engagement.', priority: 'Primary' },
                        { platform: 'Twitter / X', rationale: 'Fast product updates and founder-led commentary.', priority: 'Primary' },
                        { platform: 'Email Newsletter', rationale: 'Audience retention and direct customer education.', priority: 'Secondary' },
                        { platform: 'Google Search Ads', rationale: 'Capturing high-intent solution searchers.', priority: 'Experimental' },
                      ]).map((ch, idx) => (
                        <div key={idx} className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-black">{ch.platform}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              ch.priority === 'Primary' ? 'bg-[#fdf5f5] text-[#81171B] border border-[#f4dcd9]' : 'bg-gray-200 text-gray-700'
                            }`}>
                              {ch.priority}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-600">{ch.rationale}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* SEO Critical Fixes */}
                  <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                      <h3 className="text-sm font-bold text-black uppercase tracking-wider">SEO Recommendations</h3>
                      <button
                        onClick={() => setActiveTab('seo_audit')}
                        className="text-xs text-[#81171B] hover:underline font-medium"
                      >
                        Audit Report
                      </button>
                    </div>

                    <div className="space-y-3">
                      {issues.filter(i => i.severity !== 'good').slice(0, 3).map((issue) => (
                        <div key={issue.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                              <p className="text-xs font-bold text-black">{issue.title}</p>
                            </div>
                            <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                              {issue.severity}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600">{issue.recommendation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: AI STRATEGIST */}
          {activeTab === 'strategist' && (
            <MarketingStrategist
              workspace={workspace}
              brandProfile={brandProfile}
              userId={user?.uid || ''}
              products={products}
              onDeliverableCreated={refreshDeliverables}
              onNavigateToDeliverables={() => setActiveTab('deliverables')}
              onOpenCalendar={() => setActiveTab('content_calendar')}
              onOpenStudio={() => setActiveTab('content_studio')}
              onOpenLibrary={() => setActiveTab('content_library')}
            />
          )}

          {/* CONTENT STUDIO / CALENDAR / LIBRARY (keyed by workspace so state never leaks across workspaces) */}
          {activeTab === 'content_studio' && user && (
            <ContentStudio
              key={workspace.id}
              workspace={workspace}
              brandProfile={brandProfile}
              products={products}
              userId={user.uid}
              seedItem={studioSeed && studioSeed.workspaceId === workspace.id ? studioSeed : null}
              onSeedConsumed={clearStudioSeed}
              seedMagic={studioSeedMagic}
              onOpenLibrary={() => setActiveTab('content_library')}
            />
          )}
          {activeTab === 'content_calendar' && user && (
            <ContentCalendar
              key={workspace.id}
              workspace={workspace}
              brandProfile={brandProfile}
              products={products}
              userId={user.uid}
              onOpenInStudio={openInStudio}
            />
          )}
          {activeTab === 'content_library' && (
            <ContentLibrary
              key={workspace.id}
              workspace={workspace}
              onOpenInStudio={openInStudio}
              onOpenInCalendar={() => setActiveTab('content_calendar')}
            />
          )}

          {/* TAB 3: DELIVERABLES STUDIO */}
          {activeTab === 'deliverables' && (
            <DeliverablesViewer
              workspace={workspace}
              brandProfile={brandProfile}
              deliverables={deliverables}
              userId={user?.uid || ''}
              onRefreshDeliverables={refreshDeliverables}
            />
          )}

          {/* TAB 4: BRAND DNA */}
          {activeTab === 'brand_dna' && brandProfile && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-8">
              <div>
                <h2 className="text-xl font-bold text-black">Brand DNA & Identity Guidelines</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Synthesized brand positioning, voice guidelines, and audience hypotheses for {brandProfile.businessName}.
                </p>
              </div>

              {/* Visual Identity & Live Website Snapshot */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
                <div className="lg:col-span-1">
                  <WebsiteSnapshotCard
                    websiteScreenshotUrl={
                      workspace.websiteScreenshotUrl ||
                      brandProfile.websiteScreenshotUrl ||
                      workspace.screenshotUrl ||
                      brandProfile.screenshotUrl
                    }
                    mobileScreenshotUrl={workspace.mobileScreenshotUrl || brandProfile.mobileScreenshotUrl}
                    ogImageUrl={workspace.ogImageUrl || brandProfile.ogImageUrl}
                    screenshotUrl={workspace.screenshotUrl || brandProfile.screenshotUrl}
                    previewImageUrl={brandProfile.previewImageUrl}
                    screenshotStatus={
                      workspace.screenshotStatus ||
                      brandProfile.screenshotStatus ||
                      (workspace.screenshotUrl || brandProfile.screenshotUrl ? 'captured' : 'unavailable')
                    }
                    screenshotCapturedAt={workspace.screenshotCapturedAt || brandProfile.screenshotCapturedAt}
                    sourceUrl={workspace.websiteUrl}
                    businessName={brandProfile.businessName || workspace.name}
                    logoUrl={workspace.logoUrl || brandProfile.logoUrl}
                    onRegenerateScreenshot={handleRegenerateScreenshot}
                    isRegenerating={regeneratingScreenshot}
                  />
                </div>

                <div className="lg:col-span-2 space-y-4">
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-black flex items-center gap-1.5">
                      <Palette className="w-4 h-4 text-[#81171B]" />
                      Observed Visual Design Language
                    </h3>
                    <p className="text-xs text-gray-700 leading-relaxed">
                      {brandProfile.visualIdentityDesignLanguage?.overallAesthetic ||
                        'Structured modern web layout with clear typographical hierarchy.'}
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-2 text-xs text-gray-600">
                      <div>
                        <span className="font-semibold text-black">Color Atmosphere: </span>
                        <span>{brandProfile.visualIdentityDesignLanguage?.colorAtmosphere || 'Accented palette'}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-black">Layout Density: </span>
                        <span>{brandProfile.visualIdentityDesignLanguage?.layoutDensity || 'Balanced'}</span>
                      </div>
                    </div>
                  </div>

                  {brandProfile.visualIdentity?.colors && brandProfile.visualIdentity.colors.length > 0 && (
                    <div className="p-4 bg-white rounded-xl border border-gray-200 space-y-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-black">Brand Color Palette</span>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {brandProfile.visualIdentity.colors.map((c, i) => (
                          <div
                            key={i}
                            className="flex items-center space-x-2 px-2.5 py-1.5 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer hover:border-[#81171B]"
                            onClick={() => handleCopy(c.hex)}
                            title="Click to copy hex code"
                          >
                            <span className="w-4 h-4 rounded-md border border-gray-300" style={{ backgroundColor: c.hex }} />
                            <span className="text-xs font-mono font-medium text-black">{c.hex}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Tone of voice */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600">Tone of Voice</h3>
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <p className="text-sm font-medium text-black">{brandProfile.brandVoice.tone}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {brandProfile.brandVoice.personalityTraits.map((t, idx) => (
                      <span key={idx} className="px-2.5 py-1 text-xs bg-white text-gray-800 rounded border border-gray-200">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Do & Don'ts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Brand Do's</p>
                  <ul className="text-xs text-emerald-950 space-y-1.5 list-disc pl-4">
                    {brandProfile.brandVoice.doList.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="p-4 bg-rose-50/50 border border-rose-200 rounded-xl space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-rose-800">Brand Don'ts</p>
                  <ul className="text-xs text-rose-950 space-y-1.5 list-disc pl-4">
                    {brandProfile.brandVoice.dontList.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Value Propositions */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600">Value Propositions</h3>
                <div className="space-y-2">
                  {brandProfile.valuePropositions.map((prop, idx) => (
                    <div key={idx} className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm text-gray-800">
                      {prop}
                    </div>
                  ))}
                </div>
              </div>

              {/* Audience Personas */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600">Target Audience Hypotheses</h3>
                  <span className="text-[10px] font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    Inferred from site evidence
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {brandProfile.targetAudienceHypotheses.map((aud, idx) => (
                    <div key={idx} className="p-4 bg-white border border-gray-200 rounded-xl space-y-2">
                      <p className="text-sm font-bold text-black">{aud.persona}</p>
                      <div className="text-xs space-y-1 pt-1">
                        <p className="font-semibold text-gray-700">Pain Points:</p>
                        <ul className="list-disc pl-4 text-gray-600">
                          {aud.painPoints.map((p, i) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: WEBSITE AUDIT */}
          {activeTab === 'seo_audit' && seoAudit && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <div>
                  <h2 className="text-xl font-bold text-black">Technical & Content SEO Audit</h2>
                  <p className="text-xs text-gray-500 mt-1">Evaluated based on actual HTML metadata and heading architecture.</p>
                </div>
                <div className="flex items-center space-x-2 text-xs">
                  <span className="px-2.5 py-1 rounded bg-red-100 text-red-800 font-semibold">{criticalCount} Critical</span>
                  <span className="px-2.5 py-1 rounded bg-amber-100 text-amber-800 font-semibold">{warningCount} Warnings</span>
                  <span className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 font-semibold">{passedCount} Passed</span>
                </div>
              </div>

              {/* Issues list */}
              <div className="space-y-3">
                {seoAudit.issues.map(issue => (
                  <div
                    key={issue.id}
                    className={`p-4 rounded-xl border text-xs space-y-1.5 ${
                      issue.severity === 'critical'
                        ? 'bg-red-50/50 border-red-200'
                        : issue.severity === 'warning'
                        ? 'bg-amber-50/50 border-amber-200'
                        : 'bg-emerald-50/50 border-emerald-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-black text-sm">{issue.title}</span>
                      <span className="uppercase text-[10px] font-semibold px-2 py-0.5 rounded border border-current">
                        {issue.severity}
                      </span>
                    </div>
                    <p className="text-gray-700">
                      <span className="font-semibold text-black">Evidence:</span> {issue.evidence}
                    </p>
                    <p className="text-gray-800 pt-0.5">
                      <span className="font-semibold text-[#81171B]">Actionable Recommendation:</span> {issue.recommendation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: PRODUCTS */}
          {activeTab === 'products' && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <div>
                  <h2 className="text-xl font-bold text-black">Extracted Product & Service Offerings</h2>
                  <p className="text-xs text-gray-500 mt-1">Detected from Schema.org markup and website structure.</p>
                </div>
                <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-full">
                  {products.length} Products
                </span>
              </div>

              {products.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {products.map(prod => (
                    <div key={prod.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-2 flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-sm text-black truncate">{prod.name}</h4>
                          {prod.price && (
                            <span className="text-xs font-semibold text-[#81171B] bg-red-50 px-2 py-0.5 rounded">
                              {prod.currency} {prod.price}
                            </span>
                          )}
                        </div>
                        {prod.description && (
                          <p className="text-xs text-gray-600 line-clamp-3">{prod.description}</p>
                        )}
                      </div>
                      {prod.productUrl && (
                        <a
                          href={prod.productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pt-2 text-xs text-[#81171B] hover:underline inline-flex items-center space-x-1 font-medium"
                        >
                          <span>View Product Page</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 space-y-2">
                  <ShoppingBag className="w-10 h-10 text-gray-300 mx-auto" />
                  <p className="text-sm font-medium text-gray-700">No catalog products detected on scanned pages.</p>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto">
                    The scanner did not find standard e-commerce structured data or shopping cart elements on the inspected pages.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 7: SETTINGS & SCAN HISTORY */}
          {activeTab === 'settings' && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-8">
              <div>
                <h2 className="text-xl font-bold text-black">Workspace Settings & History</h2>
                <p className="text-xs text-gray-500 mt-1">Manage configuration and review all historical website scans.</p>
              </div>

              {/* Workspace General Config */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600">General Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="font-semibold text-gray-700">Workspace ID:</span>
                    <p className="font-mono text-gray-600 mt-0.5">{workspace.id}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Source URL:</span>
                    <p className="font-mono text-gray-600 mt-0.5">{workspace.websiteUrl}</p>
                  </div>
                </div>
              </div>

              {/* Historical Scans Table */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-gray-500" />
                  <span>Scan History Log ({scans.length})</span>
                </h3>

                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-700">Scan ID</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-700">Date</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-700">Pages</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-700">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {scans.length > 0 ? (
                        scans.map(scan => (
                          <tr key={scan.id}>
                            <td className="px-4 py-2.5 font-mono text-gray-700">{scan.id}</td>
                            <td className="px-4 py-2.5 text-gray-600">
                              {new Date(scan.startedAt).toLocaleString()}
                            </td>
                            <td className="px-4 py-2.5 text-gray-600">{scan.pagesScanned || 1} pages</td>
                            <td className="px-4 py-2.5">
                              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium capitalize">
                                {scan.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-4 py-4 text-center text-gray-500">
                            No historical scans recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
