import React, { useState } from 'react';
import { authenticatedFetch } from '../lib/firebase.ts';
import {
  Calendar,
  Layers,
  Zap,
  ShieldCheck,
  Plus,
  Trash2,
  Edit2,
  Check,
  Copy,
  Download,
  Share2,
  ExternalLink,
  ChevronRight,
  Loader2,
  Clock,
  Sparkles,
  Bot,
  Filter,
} from 'lucide-react';
import {
  DeliverableRecord,
  saveDeliverable,
  updateDeliverable,
  deleteDeliverable,
  BrandProfileRecord,
  WorkspaceRecord,
} from '../services/workspaceService.ts';

interface DeliverablesViewerProps {
  workspace: WorkspaceRecord;
  brandProfile: BrandProfileRecord | null;
  deliverables: DeliverableRecord[];
  userId: string;
  onRefreshDeliverables: () => void;
}

export function DeliverablesViewer({
  workspace,
  brandProfile,
  deliverables,
  userId,
  onRefreshDeliverables,
}: DeliverablesViewerProps) {
  const [selectedDeliverableId, setSelectedDeliverableId] = useState<string | null>(
    deliverables.length > 0 ? deliverables[0].id : null
  );

  // Filter by deliverable type
  const [filterType, setFilterType] = useState<string>('all');

  // Generator modal state
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [genType, setGenType] = useState<'content_calendar' | 'ad_campaign' | 'seo_plan' | 'brand_strategy'>('content_calendar');
  const [genInstructions, setGenInstructions] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // In-line editing state
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [editHook, setEditHook] = useState('');

  // Copy indicator
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const activeDeliverable = deliverables.find(d => d.id === selectedDeliverableId) || deliverables[0];

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleExportJson = (deliverable: DeliverableRecord) => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(deliverable.content, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${deliverable.title.replace(/\s+/g, '_').toLowerCase()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenError(null);

    try {
      const workspaceContext = {
        businessName: brandProfile?.businessName || workspace.name,
        websiteUrl: workspace.websiteUrl,
        industry: brandProfile?.industry || 'Technology & Commerce',
        businessDescription: brandProfile?.businessDescription || '',
        valuePropositions: brandProfile?.valuePropositions || [],
        targetAudienceHypotheses: brandProfile?.targetAudienceHypotheses || [],
        visualIdentity: brandProfile?.visualIdentity,
        seoIssues: brandProfile?.top3PriorityActions,
      };

      const response = await authenticatedFetch('/api/generate-deliverable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          type: genType,
          workspaceContext,
          userInstructions: genInstructions.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || 'Failed to generate deliverable');
      }

      const data = await response.json();

      const typeTitles: Record<string, string> = {
        content_calendar: `${brandProfile?.businessName || 'Brand'} Content Calendar`,
        ad_campaign: `${brandProfile?.businessName || 'Brand'} Ad Campaign Suite`,
        seo_plan: `${brandProfile?.businessName || 'Brand'} SEO Action Roadmap`,
        brand_strategy: `${brandProfile?.businessName || 'Brand'} Strategic Positioning Brief`,
      };

      const saved = await saveDeliverable({
        userId,
        workspaceId: workspace.id,
        type: genType,
        title: typeTitles[genType],
        content: data.deliverable,
        modelUsed: data.modelUsed,
      });

      onRefreshDeliverables();
      setSelectedDeliverableId(saved.id);
      setIsGeneratorOpen(false);
      setGenInstructions('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Generation failed.';
      setGenError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  // Toggle Post Status (Draft -> Scheduled -> Published)
  const handleTogglePostStatus = async (postIndex: number) => {
    if (!activeDeliverable || activeDeliverable.type !== 'content_calendar') return;
    const currentPosts = [...activeDeliverable.content.posts];
    const currentStatus = currentPosts[postIndex].status || 'draft';
    const nextStatus = currentStatus === 'draft' ? 'scheduled' : currentStatus === 'scheduled' ? 'published' : 'draft';
    currentPosts[postIndex].status = nextStatus;

    const updatedContent = {
      ...activeDeliverable.content,
      posts: currentPosts,
    };

    await updateDeliverable(activeDeliverable.id, { content: updatedContent });
    onRefreshDeliverables();
  };

  // Save inline edit to post hook & caption
  const handleSavePostEdit = async (postIndex: number) => {
    if (!activeDeliverable || activeDeliverable.type !== 'content_calendar') return;
    const currentPosts = [...activeDeliverable.content.posts];
    currentPosts[postIndex].hook = editHook;
    currentPosts[postIndex].fullCaption = editCaption;

    const updatedContent = {
      ...activeDeliverable.content,
      posts: currentPosts,
    };

    await updateDeliverable(activeDeliverable.id, { content: updatedContent });
    setEditingPostId(null);
    onRefreshDeliverables();
  };

  const handleDelete = async (deliverableId: string) => {
    if (!confirm('Are you sure you want to delete this deliverable?')) return;
    await deleteDeliverable(deliverableId);
    onRefreshDeliverables();
  };

  const filteredDeliverables = filterType === 'all'
    ? deliverables
    : deliverables.filter(d => d.type === filterType);

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-black tracking-tight">Marketing Deliverables Studio</h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-50 text-[#81171B] border border-[#f4dcd9]">
              Gemma 4 Driven
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Production-ready campaigns, schedules, and roadmaps grounded in your Brand DNA
          </p>
        </div>

        <button
          onClick={() => setIsGeneratorOpen(true)}
          className="inline-flex items-center space-x-2 bg-[#81171B] hover:bg-[#540804] text-white px-4 py-2.5 rounded-xl font-medium text-xs shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Generate New Deliverable</span>
        </button>
      </div>

      {/* Filter Chips */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-2 text-xs">
        <span className="text-gray-400 font-medium flex items-center gap-1 shrink-0">
          <Filter className="w-3.5 h-3.5" />
          Filter:
        </span>
        {['all', 'content_calendar', 'ad_campaign', 'seo_plan', 'brand_strategy'].map(type => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              filterType === type
                ? 'bg-black text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {type === 'all' && 'All Deliverables'}
            {type === 'content_calendar' && 'Content Calendars'}
            {type === 'ad_campaign' && 'Ad Campaigns'}
            {type === 'seo_plan' && 'SEO Roadmaps'}
            {type === 'brand_strategy' && 'Brand Strategies'}
          </button>
        ))}
      </div>

      {/* Main Studio View */}
      {deliverables.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 text-[#81171B] flex items-center justify-center mx-auto">
            <Calendar className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-black">No Marketing Deliverables Yet</h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              Use Google Gemma 4 to generate a custom 7-day content calendar, multi-platform ad campaign, or on-page SEO remediation plan.
            </p>
          </div>
          <button
            onClick={() => setIsGeneratorOpen(true)}
            className="inline-flex items-center space-x-1.5 bg-[#81171B] hover:bg-[#540804] text-white px-4 py-2 rounded-lg font-medium text-xs transition-colors shadow-2xs"
          >
            <Plus className="w-4 h-4" />
            <span>Generate First Deliverable</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Deliverables List Sidebar */}
          <div className="lg:col-span-1 space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 px-1">
              Deliverables ({filteredDeliverables.length})
            </span>
            <div className="space-y-2">
              {filteredDeliverables.map(deliv => {
                const isSelected = activeDeliverable?.id === deliv.id;
                return (
                  <div
                    key={deliv.id}
                    onClick={() => setSelectedDeliverableId(deliv.id)}
                    className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#fdf8f8] border-[#81171B] shadow-2xs'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-gray-900 mb-1">
                      <span className="truncate pr-2">{deliv.title}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(deliv.id);
                        }}
                        className="text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete deliverable"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <span className="capitalize">{deliv.type.replace('_', ' ')}</span>
                      <span className="font-mono text-[10px]">{deliv.modelUsed === 'fallback-rules' ? 'Rule based fallback' : (deliv.modelUsed || 'Attribution unavailable')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Deliverable Content Display */}
          <div className="lg:col-span-3 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
            {activeDeliverable ? (
              <div>
                {/* Deliverable Meta Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-gray-100">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-lg font-bold text-black">{activeDeliverable.title}</h3>
                      <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-800 border border-gray-200 capitalize">
                        {activeDeliverable.type.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-gray-500 mt-1">
                      <span>Generated with {activeDeliverable.modelUsed === 'fallback-rules' ? 'Rule based fallback' : (activeDeliverable.modelUsed || 'Attribution unavailable')}</span>
                {activeDeliverable.generationWarning && <div role="status" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">{activeDeliverable.generationWarning}</div>}
                      <span>•</span>
                      <span>{new Date(activeDeliverable.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleCopy(JSON.stringify(activeDeliverable.content, null, 2), activeDeliverable.id)}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs font-medium text-gray-700 transition-colors inline-flex items-center space-x-1"
                    >
                      {copiedKey === activeDeliverable.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === activeDeliverable.id ? 'Copied' : 'Copy JSON'}</span>
                    </button>
                    <button
                      onClick={() => handleExportJson(activeDeliverable)}
                      className="px-3 py-1.5 rounded-lg bg-black hover:bg-gray-800 text-white text-xs font-medium transition-colors inline-flex items-center space-x-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export</span>
                    </button>
                  </div>
                </div>

                {/* Content Renderers by Type */}
                {activeDeliverable.type === 'content_calendar' && (
                  <div className="space-y-6 pt-4">
                    {/* Strategy Overview */}
                    {activeDeliverable.content?.strategyOverview && (
                      <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-1">
                        <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">Strategy Overview</span>
                        <p className="text-xs text-gray-700 leading-relaxed">{activeDeliverable.content.strategyOverview}</p>
                        <div className="flex flex-wrap gap-4 pt-2 text-[11px] text-gray-500 font-medium">
                          <span>Cadence: <strong>{activeDeliverable.content.cadence || 'Daily'}</strong></span>
                          <span>Target: <strong>{activeDeliverable.content.targetAudience || 'Core Audience'}</strong></span>
                        </div>
                      </div>
                    )}

                    {/* Posts Cards Grid */}
                    <div className="space-y-4">
                      <span className="text-xs font-bold text-gray-900 uppercase tracking-wider block">
                        Scheduled Posts ({activeDeliverable.content?.posts?.length || 0})
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeDeliverable.content?.posts?.map((post: any, idx: number) => {
                          const isEditing = editingPostId === `${activeDeliverable.id}_${idx}`;
                          const status = post.status || 'draft';

                          return (
                            <div
                              key={idx}
                              className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs space-y-3 hover:border-gray-300 transition-all flex flex-col justify-between"
                            >
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                  <div className="flex items-center space-x-1.5">
                                    <span className="font-bold text-black">{post.dayOrDate}</span>
                                    <span className="text-gray-400">•</span>
                                    <span className="px-2 py-0.5 rounded bg-[#fdf5f5] text-[#81171B] font-semibold text-[10px] border border-[#f4dcd9]">
                                      {post.platform}
                                    </span>
                                  </div>

                                  {/* Toggleable Status Badge */}
                                  <button
                                    onClick={() => handleTogglePostStatus(idx)}
                                    title="Click to toggle status"
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors border ${
                                      status === 'published'
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                        : status === 'scheduled'
                                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                                        : 'bg-gray-100 text-gray-600 border-gray-200'
                                    }`}
                                  >
                                    {status}
                                  </button>
                                </div>

                                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
                                  Pillar: {post.contentPillar}
                                </span>

                                {isEditing ? (
                                  <div className="space-y-2 pt-2">
                                    <label className="text-[10px] font-bold text-gray-600 uppercase">Hook</label>
                                    <input
                                      type="text"
                                      value={editHook}
                                      onChange={(e) => setEditHook(e.target.value)}
                                      className="w-full text-xs p-2 border border-gray-300 rounded focus:border-[#81171B] outline-none"
                                    />
                                    <label className="text-[10px] font-bold text-gray-600 uppercase">Full Caption</label>
                                    <textarea
                                      rows={4}
                                      value={editCaption}
                                      onChange={(e) => setEditCaption(e.target.value)}
                                      className="w-full text-xs p-2 border border-gray-300 rounded focus:border-[#81171B] outline-none"
                                    />
                                    <div className="flex items-center space-x-2 pt-1">
                                      <button
                                        onClick={() => handleSavePostEdit(idx)}
                                        className="px-2.5 py-1 bg-[#81171B] text-white text-xs font-semibold rounded"
                                      >
                                        Save
                                      </button>
                                      <button
                                        onClick={() => setEditingPostId(null)}
                                        className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <p className="text-xs font-bold text-gray-900 border-l-2 border-[#81171B] pl-2">
                                      "{post.hook}"
                                    </p>
                                    <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed line-clamp-4">
                                      {post.fullCaption}
                                    </p>
                                  </div>
                                )}
                              </div>

                              <div className="space-y-2 pt-2 border-t border-gray-100 text-[11px]">
                                {post.visualCreativeNote && (
                                  <p className="text-gray-500 italic">
                                    🎨 Asset: {post.visualCreativeNote}
                                  </p>
                                )}
                                {post.hashtags && post.hashtags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 text-[#81171B] font-mono text-[10px]">
                                    {post.hashtags.map((tag: string, tIdx: number) => (
                                      <span key={tIdx}>{tag.startsWith('#') ? tag : `#${tag}`}</span>
                                    ))}
                                  </div>
                                )}
                                <div className="flex items-center justify-between pt-1">
                                  <span className="text-[10px] font-semibold text-gray-600">CTA: {post.callToAction}</span>
                                  {!isEditing && (
                                    <button
                                      onClick={() => {
                                        setEditingPostId(`${activeDeliverable.id}_${idx}`);
                                        setEditHook(post.hook);
                                        setEditCaption(post.fullCaption);
                                      }}
                                      className="text-gray-400 hover:text-black inline-flex items-center space-x-1"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                      <span className="text-[10px]">Edit</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Ad Campaign Suite Renderer */}
                {activeDeliverable.type === 'ad_campaign' && (
                  <div className="space-y-6 pt-4">
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-1">
                      <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">Campaign Overview</span>
                      <p className="text-xs text-gray-700">{activeDeliverable.content?.strategicAngle}</p>
                      <span className="text-[11px] font-semibold text-[#81171B] block pt-1">
                        Budget Tier: {activeDeliverable.content?.recommendedBudgetTier}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {activeDeliverable.content?.ads?.map((ad: any, idx: number) => (
                        <div key={idx} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-800 text-[10px] font-bold">
                              {ad.platform}
                            </span>
                            <span className="text-[10px] text-gray-500 font-semibold">{ad.campaignObjective}</span>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">Headline</span>
                            <h4 className="text-sm font-bold text-black">{ad.primaryHeadline}</h4>
                            {ad.secondaryHeadline && (
                              <p className="text-xs text-gray-600">{ad.secondaryHeadline}</p>
                            )}
                          </div>

                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">Primary Text</span>
                            <p className="text-xs text-gray-800 leading-relaxed">{ad.primaryText}</p>
                          </div>

                          <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
                            <span className="font-semibold text-gray-600">Button: <strong>{ad.callToActionText}</strong></span>
                            <span className="text-[10px] text-gray-400 font-mono">Angle: {ad.adAngle}</span>
                          </div>

                          {ad.visualCreativeBrief && (
                            <div className="p-2 bg-gray-50 rounded text-[11px] text-gray-600 italic">
                              Creative Brief: {ad.visualCreativeBrief}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* SEO Action Plan Renderer */}
                {activeDeliverable.type === 'seo_plan' && (
                  <div className="space-y-6 pt-4">
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-gray-900 uppercase">Target Domain</span>
                        <p className="text-sm font-mono text-[#81171B] font-semibold">{activeDeliverable.content?.targetDomain}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-gray-500">Audit Score</span>
                        <p className="text-2xl font-black text-black">{activeDeliverable.content?.overallAuditScore || 85}/100</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      {activeDeliverable.content?.remediationPhases?.map((phase: any, pIdx: number) => (
                        <div key={pIdx} className="space-y-3">
                          <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                            <h4 className="text-sm font-bold text-black">{phase.phaseName}</h4>
                            <span className="text-xs font-semibold text-gray-500">{phase.timeline}</span>
                          </div>

                          <div className="space-y-3">
                            {phase.actionItems?.map((item: any, iIdx: number) => (
                              <div key={iIdx} className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-bold text-gray-800">{item.category}</span>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    item.priority === 'High' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-700'
                                  }`}>
                                    {item.priority} Priority
                                  </span>
                                </div>
                                <p className="text-xs text-gray-800 font-medium">{item.issue}</p>
                                <div className="bg-gray-950 text-gray-200 rounded-lg p-2.5 font-mono text-[11px] overflow-x-auto">
                                  {item.exactImplementationCodeOrCopy}
                                </div>
                                <p className="text-[11px] text-emerald-800 font-medium">
                                  Expected Impact: {item.expectedImpact}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Brand Strategy Renderer */}
                {activeDeliverable.type === 'brand_strategy' && (
                  <div className="space-y-6 pt-4">
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                      <span className="text-xs font-bold text-gray-900 uppercase">Executive Summary</span>
                      <p className="text-xs text-gray-800 leading-relaxed">{activeDeliverable.content?.executiveSummary}</p>
                      <div className="flex items-center gap-4 pt-2 text-xs">
                        <span>Archetype: <strong>{activeDeliverable.content?.brandArchetype}</strong></span>
                        <span>Harmony Score: <strong>{activeDeliverable.content?.visualAndCopyHarmonyScore}/100</strong></span>
                      </div>
                    </div>

                    {/* Personas */}
                    {activeDeliverable.content?.targetPersonaProfiles && (
                      <div className="space-y-3">
                        <span className="text-xs font-bold text-gray-900 uppercase">Target Persona Profiles</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {activeDeliverable.content.targetPersonaProfiles.map((persona: any, pIdx: number) => (
                            <div key={pIdx} className="border border-gray-200 rounded-xl p-4 space-y-2 text-xs">
                              <h5 className="font-bold text-black">{persona.name} ({persona.role})</h5>
                              <div>
                                <span className="font-semibold text-gray-500">Core Needs:</span>
                                <ul className="list-disc list-inside text-gray-700 text-[11px]">
                                  {persona.coreNeeds?.map((n: string, i: number) => <li key={i}>{n}</li>)}
                                </ul>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Generator Modal */}
      {isGeneratorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 border border-gray-200 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-[#81171B] text-white flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-black">Generate Deliverable</h3>
                  <p className="text-xs text-gray-500">Powered by Google Gemma 4</p>
                </div>
              </div>
              <button
                onClick={() => setIsGeneratorOpen(false)}
                className="text-gray-400 hover:text-black font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Deliverable Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'content_calendar', label: 'Content Calendar' },
                    { id: 'ad_campaign', label: 'Ad Campaign Suite' },
                    { id: 'seo_plan', label: 'SEO Action Roadmap' },
                    { id: 'brand_strategy', label: 'Brand Strategy Brief' },
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setGenType(item.id as any)}
                      className={`p-2.5 rounded-lg border text-xs font-semibold text-left transition-colors ${
                        genType === item.id
                          ? 'border-[#81171B] bg-[#fdf8f8] text-[#81171B]'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Custom Instructions (Optional)
                </label>
                <textarea
                  rows={3}
                  value={genInstructions}
                  onChange={(e) => setGenInstructions(e.target.value)}
                  placeholder="e.g. Focus on B2B LinkedIn posts, emphasize speed of fulfillment, and test 2 humor-driven angles..."
                  className="w-full text-xs p-3 border border-gray-300 rounded-xl focus:border-[#81171B] outline-none"
                />
              </div>

              {genError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  {genError}
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsGeneratorOpen(false)}
                  disabled={isGenerating}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="px-5 py-2 rounded-lg bg-[#81171B] hover:bg-[#540804] text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-2xs"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Generating with Gemma 4...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generate Deliverable</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
