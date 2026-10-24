import { authenticatedFetch } from '../lib/firebase.ts';
import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Sparkles,
  Bot,
  User,
  Loader2,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  Zap,
  BookmarkPlus,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import {
  ChatMessageRecord,
  saveChatMessage,
  fetchChatMessages,
  saveDeliverable,
  BrandProfileRecord,
  WorkspaceRecord,
} from '../services/workspaceService.ts';
import { BRAND_ASSETS } from '../lib/branding.ts';
import { newChatMessageId, normalizeModelUsed } from '../lib/chatMessage.ts';

interface MarketingStrategistProps {
  workspace: WorkspaceRecord;
  brandProfile: BrandProfileRecord | null;
  userId: string;
  onDeliverableCreated?: () => void;
  onNavigateToDeliverables?: () => void;
}

const QUICK_PROMPTS = [
  {
    icon: Calendar,
    title: 'Generate Content Calendar',
    prompt: 'Build a comprehensive 7-day multi-channel social media and content marketing calendar targeting our core buyer persona.',
  },
  {
    icon: Sparkles,
    title: 'Audit Visual vs Copy Harmony',
    prompt: 'Analyze any discrepancies between our visual aesthetic, colors, and our written headline messaging. How can we make them 100% aligned?',
  },
  {
    icon: Zap,
    title: 'High-Converting Ad Angles',
    prompt: 'Write 4 distinct paid advertising angles (testing pain-point, social proof, and risk reversal) with primary copy and headlines for Meta and Google Ads.',
  },
  {
    icon: ShieldCheck,
    title: 'SEO Action Plan',
    prompt: 'Based on our SEO audit findings, what are the top 3 highest-priority on-page and technical fixes we must implement this week?',
  },
];

export function MarketingStrategist({
  workspace,
  brandProfile,
  userId,
  onDeliverableCreated,
  onNavigateToDeliverables,
}: MarketingStrategistProps) {
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  // A user message whose AI response failed. Retrying re-uses its id, so nothing is duplicated.
  const [failedTurn, setFailedTurn] = useState<ChatMessageRecord | null>(null);
  const inFlightRef = useRef(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savingDeliverable, setSavingDeliverable] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const modelBadge = brandProfile?.modelAttribution?.modelUsed || 'model attribution unavailable';
  const isMultimodal = Boolean(brandProfile?.modelAttribution?.isMultimodal);

  // Load chat history from Firestore
  useEffect(() => {
    let mounted = true;
    async function loadHistory() {
      try {
        const history = await fetchChatMessages(workspace.id);
        if (mounted) {
          if (history.length > 0) {
            setMessages(history);
          } else {
            // Seed initial greeting
            const initialGreeting: ChatMessageRecord = {
              id: 'init_greeting',
              ownerId: userId,
              workspaceId: workspace.id,
              role: 'assistant',
              content: `Hello! I am your Marketing Strategist. Model attribution will be shown after an AI response is generated.\n\nI have reviewed the brand data for **${brandProfile?.businessName || workspace.name}**${isMultimodal ? ' including your website screenshot and visual identity' : ''}.\n\nHow can I help you grow today? Choose a strategic prompt below or ask any marketing question.`,
              suggestedActions: [
                'Build a 7-day multi-channel content calendar',
                'Audit visual aesthetic vs headline messaging',
                'Create high-converting ad campaign copy',
              ],
              createdAt: new Date().toISOString(),
            };
            setMessages([initialGreeting]);
          }
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
      }
    }

    loadHistory();
    return () => {
      mounted = false;
    };
  }, [workspace.id, userId, modelBadge, brandProfile?.businessName, isMultimodal]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const buildWorkspaceContext = () => ({
    businessName: brandProfile?.businessName || workspace.name,
    websiteUrl: workspace.websiteUrl,
    industry: brandProfile?.industry || 'Technology & Commerce',
    businessDescription: brandProfile?.businessDescription || '',
    brandVoice: brandProfile?.brandVoice,
    targetAudienceHypotheses: brandProfile?.targetAudienceHypotheses,
    visualIdentity: brandProfile?.visualIdentity,
    seoRecommendations: brandProfile?.top3PriorityActions,
    multimodalFindings: {
      visualLanguage: brandProfile?.visualIdentityDesignLanguage,
      discrepancies: brandProfile?.visualVsMessagingDiscrepancies,
    },
  });

  /**
   * Runs one chat turn. `existingUserMsg` is set when retrying a failed turn: the user
   * message is already on screen and keeps its id, so Firestore overwrites rather than duplicates.
   */
  const runTurn = async (userMsg: ChatMessageRecord, isRetry: boolean) => {
    if (inFlightRef.current) return; // block double submits
    inFlightRef.current = true;
    setError(null);
    setSaveWarning(null);
    setFailedTurn(null);
    setIsLoading(true);

    const priorMessages = isRetry ? messages.filter(m => m.id !== userMsg.id) : messages;
    if (!isRetry) setMessages(prev => [...prev, userMsg]);

    // 1. Persist the user message. A storage problem must never block or crash the chat.
    try {
      await saveChatMessage({
        id: userMsg.id,
        userId,
        workspaceId: workspace.id,
        role: 'user',
        content: userMsg.content,
        createdAt: userMsg.createdAt,
      });
    } catch (err) {
      console.warn('[Strategist] Could not save user message:', err);
      setSaveWarning('Your message could not be saved to chat history. The conversation will continue.');
    }

    // 2. Ask Gemma 4 (server side).
    try {
      const response = await authenticatedFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          workspaceContext: buildWorkspaceContext(),
          history: [...priorMessages, userMsg].map(m => ({ role: m.role, content: m.content })),
          message: userMsg.content,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({} as { error?: string }));
        throw new Error(errJson.error || 'The AI Strategist could not respond. Please retry.');
      }

      const data = await response.json();
      if (typeof data?.reply !== 'string' || !data.reply.trim()) {
        throw new Error('The AI Strategist returned an empty response. Please retry.');
      }

      // Only attribute a model if the server reported a real one.
      const modelUsed = normalizeModelUsed(data.modelUsed);
      const assistantMsg: ChatMessageRecord = {
        id: newChatMessageId(),
        ownerId: userId,
        workspaceId: workspace.id,
        role: 'assistant',
        content: data.reply,
        ...(modelUsed ? { modelUsed } : {}),
        ...(Array.isArray(data.suggestedNextActions) && data.suggestedNextActions.length
          ? { suggestedActions: data.suggestedNextActions as string[] }
          : {}),
        createdAt: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMsg]);

      // 3. Persist the assistant message. Failure here only shows a warning.
      try {
        await saveChatMessage({
          id: assistantMsg.id,
          userId,
          workspaceId: workspace.id,
          role: 'assistant',
          content: assistantMsg.content,
          modelUsed: assistantMsg.modelUsed,
          suggestedActions: assistantMsg.suggestedActions,
          createdAt: assistantMsg.createdAt,
        });
      } catch (err) {
        console.warn('[Strategist] Could not save assistant message:', err);
        setSaveWarning('The response could not be saved to chat history, but you can still read and copy it.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Strategist chat failed.');
      setFailedTurn(userMsg);
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading || inFlightRef.current) return;
    setInputMessage('');
    await runTurn(
      {
        id: newChatMessageId(),
        ownerId: userId,
        workspaceId: workspace.id,
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      },
      false
    );
  };

  const handleRetry = async () => {
    if (!failedTurn || isLoading) return;
    await runTurn(failedTurn, true);
  };

  // Convert Chat Content into a Structured Deliverable
  const handleQuickDeliverableGeneration = async (type: 'content_calendar' | 'ad_campaign' | 'seo_plan' | 'brand_strategy') => {
    setSavingDeliverable(type);
    setError(null);

    try {
      const workspaceContext = {
        businessName: brandProfile?.businessName || workspace.name,
        websiteUrl: workspace.websiteUrl,
        industry: brandProfile?.industry || 'Technology & Commerce',
        businessDescription: brandProfile?.businessDescription || '',
        valuePropositions: brandProfile?.valuePropositions || [],
        targetAudienceHypotheses: brandProfile?.targetAudienceHypotheses || [],
      };

      const res = await authenticatedFetch('/api/generate-deliverable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          type,
          workspaceContext,
          userInstructions: `Generate an actionable, high-quality ${type} deliverable using Gemma 4.`,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to generate deliverable');
      }

      const result = await res.json();

      const titles: Record<string, string> = {
        content_calendar: `${brandProfile?.businessName || 'Brand'} 7-Day Content Sprint`,
        ad_campaign: `${brandProfile?.businessName || 'Brand'} Multi-Platform Ad Suite`,
        seo_plan: `${brandProfile?.businessName || 'Brand'} SEO Action Roadmap`,
        brand_strategy: `${brandProfile?.businessName || 'Brand'} Strategy Executive Brief`,
      };

      await saveDeliverable({
        userId,
        workspaceId: workspace.id,
        type,
        title: titles[type],
        content: result.deliverable,
        modelUsed: result.modelUsed || modelBadge,
      });

      if (onDeliverableCreated) onDeliverableCreated();
      if (onNavigateToDeliverables) onNavigateToDeliverables();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save deliverable.';
      setError(msg);
    } finally {
      setSavingDeliverable(null);
    }
  };

  return (
    <div className="flex flex-col h-[750px] bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Header with Truthful Attribution */}
      <div className="flex flex-wrap items-center justify-between px-6 py-4 bg-gray-50 border-b border-gray-200 gap-4">
        <div className="flex items-center space-x-3">
          <img
            src={BRAND_ASSETS.iconLogoSquare}
            alt="NexusMark AI"
            className="w-9 h-9 rounded-xl object-cover border border-gray-200 shadow-xs"
          />
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-black tracking-tight">AI Marketing Strategist</h2>
              <span className="inline-flex items-center space-x-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Active</span>
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Grounded in {brandProfile?.businessName || workspace.name}'s verified Brand DNA
            </p>
          </div>
        </div>

        {/* Gemma 4 Model Badge */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 px-3 py-1 bg-white border border-gray-200 rounded-full shadow-2xs text-xs font-medium text-gray-700">
            <Bot className="w-3.5 h-3.5 text-[#81171B]" />
            <span className="font-semibold text-black">Gemma 4</span>
            <span className="text-gray-400 font-mono text-[10px]">({modelBadge})</span>
          </div>
          {isMultimodal ? (
            <span className="text-[11px] font-medium text-purple-800 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-full">
              Multimodal (Screenshot + Text)
            </span>
          ) : (
            <span className="text-[11px] font-medium text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
              Text Analysis
            </span>
          )}
        </div>
      </div>

      {/* Quick Deliverable Action Bar */}
      <div className="px-6 py-2.5 bg-[#fdf8f8] border-b border-[#f3dada] flex items-center justify-between flex-wrap gap-2 text-xs">
        <span className="font-semibold text-gray-700 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-[#81171B]" />
          Instant Deliverables:
        </span>
        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={() => handleQuickDeliverableGeneration('content_calendar')}
            disabled={Boolean(savingDeliverable)}
            className="px-2.5 py-1 rounded bg-white border border-gray-200 text-gray-800 hover:border-[#81171B] hover:text-[#81171B] transition-colors font-medium flex items-center space-x-1 shadow-2xs"
          >
            {savingDeliverable === 'content_calendar' ? <Loader2 className="w-3 h-3 animate-spin text-[#81171B]" /> : <Calendar className="w-3 h-3 text-[#81171B]" />}
            <span>Content Calendar</span>
          </button>
          <button
            onClick={() => handleQuickDeliverableGeneration('ad_campaign')}
            disabled={Boolean(savingDeliverable)}
            className="px-2.5 py-1 rounded bg-white border border-gray-200 text-gray-800 hover:border-[#81171B] hover:text-[#81171B] transition-colors font-medium flex items-center space-x-1 shadow-2xs"
          >
            {savingDeliverable === 'ad_campaign' ? <Loader2 className="w-3 h-3 animate-spin text-[#81171B]" /> : <Zap className="w-3 h-3 text-[#81171B]" />}
            <span>Ad Campaign</span>
          </button>
          <button
            onClick={() => handleQuickDeliverableGeneration('seo_plan')}
            disabled={Boolean(savingDeliverable)}
            className="px-2.5 py-1 rounded bg-white border border-gray-200 text-gray-800 hover:border-[#81171B] hover:text-[#81171B] transition-colors font-medium flex items-center space-x-1 shadow-2xs"
          >
            {savingDeliverable === 'seo_plan' ? <Loader2 className="w-3 h-3 animate-spin text-[#81171B]" /> : <ShieldCheck className="w-3 h-3 text-[#81171B]" />}
            <span>SEO Roadmap</span>
          </button>
          {onNavigateToDeliverables && (
            <button
              onClick={onNavigateToDeliverables}
              className="text-xs text-[#81171B] hover:underline font-semibold ml-2 inline-flex items-center gap-1"
            >
              <span>View Saved</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex items-start space-x-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <img
                src={BRAND_ASSETS.iconLogoSquare}
                alt="NexusMark AI"
                className="w-8 h-8 rounded-lg object-cover border border-gray-200 shrink-0 mt-0.5 shadow-2xs"
              />
            )}

            <div className={`max-w-[80%] rounded-xl p-4 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-black text-white font-medium'
                : 'bg-gray-50 border border-gray-200 text-gray-900 shadow-2xs'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>

              {/* Suggested Follow-up Actions */}
              {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-200 space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Suggested Next Actions:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {msg.suggestedActions.map((act, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(act)}
                        disabled={isLoading}
                        className="text-xs text-left bg-white border border-gray-200 hover:border-[#81171B] hover:text-[#81171B] text-gray-700 px-3 py-1.5 rounded-lg transition-colors shadow-2xs font-medium"
                      >
                        → {act}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Message Footer */}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200/50 text-[10px] text-gray-400">
                <span className="font-mono">
                  {normalizeModelUsed(msg.modelUsed) ? `Model: ${normalizeModelUsed(msg.modelUsed)}` : ''}
                </span>
                <button
                  onClick={() => handleCopy(msg.content, msg.id)}
                  className="hover:text-gray-600 inline-flex items-center gap-1"
                >
                  {copiedId === msg.id ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-600 font-semibold">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-lg bg-gray-200 text-gray-700 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center space-x-3">
            <img
              src={BRAND_ASSETS.iconLogoSquare}
              alt="NexusMark AI"
              className="w-8 h-8 rounded-lg object-cover border border-gray-200 shrink-0 animate-pulse"
            />
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center space-x-2 text-xs text-gray-600 shadow-2xs">
              <Loader2 className="w-4 h-4 animate-spin text-[#81171B]" />
              <span>Gemma 4 is synthesizing strategic recommendations...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompts if Conversation is short */}
      {messages.length <= 2 && (
        <div className="px-6 py-3 bg-gray-50/50 border-t border-gray-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {QUICK_PROMPTS.map((qp, idx) => {
              const Icon = qp.icon;
              return (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(qp.prompt)}
                  disabled={isLoading}
                  className="flex items-center space-x-2 text-left p-2.5 rounded-lg bg-white border border-gray-200 hover:border-[#81171B] transition-colors shadow-2xs group"
                >
                  <Icon className="w-4 h-4 text-[#81171B] shrink-0" />
                  <span className="text-xs font-medium text-gray-800 group-hover:text-[#81171B] truncate">
                    {qp.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="px-6 py-2 bg-red-50 border-t border-red-200 text-xs text-red-700 font-medium flex items-center justify-between gap-3">
          <span>{error}</span>
          {failedTurn && (
            <button
              onClick={handleRetry}
              disabled={isLoading}
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#81171B] text-white hover:bg-[#540804] disabled:opacity-40 font-semibold"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          )}
        </div>
      )}
      {saveWarning && !error && (
        <div role="status" className="px-6 py-2 bg-amber-50 border-t border-amber-200 text-xs text-amber-800 font-medium">
          {saveWarning}
        </div>
      )}

      {/* Chat Input */}
      <div className="p-4 bg-white border-t border-gray-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center space-x-2"
        >
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={`Ask Gemma 4 anything about marketing ${brandProfile?.businessName || 'this brand'}...`}
            disabled={isLoading}
            className="flex-1 bg-gray-50 border border-gray-300 focus:border-[#81171B] focus:bg-white focus:outline-none rounded-xl px-4 py-3 text-sm text-black placeholder-gray-400 font-sans transition-all"
          />
          <button
            type="submit"
            disabled={isLoading || !inputMessage.trim()}
            className="bg-[#81171B] hover:bg-[#540804] disabled:opacity-40 disabled:hover:bg-[#81171B] text-white px-5 py-3 rounded-xl font-medium text-sm transition-colors flex items-center space-x-1.5 shrink-0 shadow-2xs"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span className="hidden sm:inline">Ask</span>
          </button>
        </form>
      </div>
    </div>
  );
}
