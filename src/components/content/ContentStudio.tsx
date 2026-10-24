import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Loader2, Copy, Check, Save, Wand2, BookOpen } from 'lucide-react';
import type { BrandProfileRecord, ProductRecord, WorkspaceRecord } from '../../services/workspaceService.ts';
import { buildBrandContext, brandPalette, suggestedAudience, suggestedTone } from '../../lib/brandContext.ts';
import { contentApi } from '../../lib/contentApi.ts';
import {
  PLATFORMS, PLATFORM_LABELS, FORMATS_BY_PLATFORM, FORMAT_LABELS, OBJECTIVES, STATUSES, STATUS_LABELS,
  defaultAspectRatio, type AspectRatio, type ContentFormat, type ContentItemRecord, type ContentPayload,
  type ContentStatus, type Platform,
} from '../../lib/contentTypes.ts';
import {
  buildContentItem, createContentItem, updateContentItem, newContentId, browserTimeZone,
} from '../../services/contentService.ts';
import { ContentEditor } from './ContentEditor.tsx';
import { CreativePreview } from './CreativePreview.tsx';
import { Field, Notice, StatusBadge, inputCls, primaryBtn, ghostBtn } from './ui.tsx';

interface Draft {
  key: string;                 // doubles as the Firestore id => saving twice can never duplicate
  content: ContentPayload;
  aspectRatio: AspectRatio;
  status: ContentStatus;
  campaign: string;
  warnings: string[];
  modelUsed?: string;
  imageAssetUrl?: string;      // Firebase Storage URL of a persisted AI image, when one was saved
  saved: boolean;              // exists in Firestore
  dirty: boolean;
  publishedRecordedAt?: string;
  base?: ContentItemRecord;    // original record when editing a saved item
}

interface Props {
  workspace: WorkspaceRecord;
  brandProfile: BrandProfileRecord | null;
  products: ProductRecord[];
  userId: string;
  seedItem: ContentItemRecord | null;
  onSeedConsumed: () => void;
  onOpenLibrary: () => void;
}

export function ContentStudio({ workspace, brandProfile, products, userId, seedItem, onSeedConsumed, onOpenLibrary }: Props) {
  const context = useMemo(() => buildBrandContext(workspace, brandProfile, products), [workspace, brandProfile, products]);

  const [platform, setPlatform] = useState<Platform>('instagram');
  const [format, setFormat] = useState<ContentFormat>('post');
  const [objective, setObjective] = useState<string>('brand_awareness');
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState(suggestedAudience(brandProfile));
  const [tone, setTone] = useState(suggestedTone(brandProfile));
  const [language, setLanguage] = useState('English');
  const [cta, setCta] = useState('');
  const [variations, setVariations] = useState(2);
  const [customRequest, setCustomRequest] = useState('');
  const [campaign, setCampaign] = useState('');

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [imageCap, setImageCap] = useState<{ configured: boolean; model: string | null } | null>(null);
  const [textModel, setTextModel] = useState<{ model: string; configured: boolean } | null>(null);
  const inFlight = useRef(false);
  const saveInFlight = useRef(false);

  // Real capabilities from the server (never assumed).
  useEffect(() => {
    contentApi.capabilities().then(c => { setImageCap(c.image); setTextModel({ model: c.textModel, configured: c.textConfigured }); }).catch(() => setImageCap({ configured: false, model: null }));
  }, []);

  // Open a saved item (from Library / Calendar).
  useEffect(() => {
    if (!seedItem) return;
    setDrafts([{
      key: seedItem.id, content: seedItem.content, aspectRatio: seedItem.aspectRatio, status: seedItem.status,
      campaign: seedItem.campaign || '', warnings: [], modelUsed: seedItem.modelUsed, imageAssetUrl: seedItem.imageAssetUrl, saved: true, dirty: false,
      publishedRecordedAt: seedItem.publishedRecordedAt, base: seedItem,
    }]);
    setActive(0); setTab('edit'); setError(null); setSaveMsg(null);
    onSeedConsumed();
  }, [seedItem, onSeedConsumed]);

  const draft = drafts[active];
  const formats = FORMATS_BY_PLATFORM[platform];

  const changePlatform = (p: Platform) => {
    setPlatform(p);
    if (!FORMATS_BY_PLATFORM[p].includes(format)) setFormat(FORMATS_BY_PLATFORM[p][0]);
  };

  const updateDraft = (index: number, fn: (d: Draft) => Draft) =>
    setDrafts(prev => prev.map((d, i) => (i === index ? fn(d) : d)));

  const generate = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setGenerating(true); setError(null); setSaveMsg(null);
    try {
      const res = await contentApi.generate(context, {
        platform, format, objective, topic, audience, tone, language, cta, variations, customRequest,
      });
      setDrafts(res.variations.map((c, i) => ({
        key: newContentId('cnt'), content: c, aspectRatio: defaultAspectRatio(platform, format), status: 'draft' as ContentStatus,
        campaign, warnings: res.warnings[i] || [], modelUsed: res.modelUsed, saved: false, dirty: true,
      })));
      setActive(0); setTab('edit');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed. Please retry.');
    } finally {
      inFlight.current = false; setGenerating(false);
    }
  };

  const save = async (overrides?: Partial<Pick<Draft, 'status' | 'publishedRecordedAt'>>) => {
    if (!draft || saveInFlight.current) return;
    saveInFlight.current = true; setSaving(true); setSaveMsg(null);
    const idx = active;
    const d: Draft = { ...draft, ...overrides };
    try {
      if (!d.saved) {
        const rec = buildContentItem({
          id: d.key, userId, workspaceId: workspace.id, kind: 'studio', content: d.content, aspectRatio: d.aspectRatio,
          status: d.status, campaign: d.campaign, modelUsed: d.modelUsed, imageAssetUrl: d.imageAssetUrl, timezone: browserTimeZone(),
        });
        if (d.publishedRecordedAt) rec.publishedRecordedAt = d.publishedRecordedAt;
        await createContentItem(rec);
      } else {
        await updateContentItem(d.key, {
          content: d.content, aspectRatio: d.aspectRatio, status: d.status, ...(d.imageAssetUrl ? { imageAssetUrl: d.imageAssetUrl } : {}),
          // only touch campaign when the user typed one; an empty field never erases a saved value silently
          ...(d.campaign.trim() ? { campaign: d.campaign.trim() } : {}),
          ...(d.publishedRecordedAt ? { publishedRecordedAt: d.publishedRecordedAt } : {}),
        });
      }
      updateDraft(idx, x => ({ ...x, ...overrides, saved: true, dirty: false }));
      setSaveMsg({ tone: 'ok', text: 'Saved to your Content Library.' });
    } catch (e) {
      console.error('[Studio] save failed', e);
      setSaveMsg({ tone: 'error', text: 'Could not save. Your edits are still here, so you can try again.' });
    } finally {
      saveInFlight.current = false; setSaving(false);
    }
  };

  const recordPublished = async () => {
    if (!window.confirm('Only mark this as Published if you have actually posted it yourself. NexusMark does not publish to social accounts. Continue?')) return;
    await save({ status: 'published', publishedRecordedAt: new Date().toISOString() });
  };

  const copy = async (what: 'caption' | 'hashtags' | 'all') => {
    if (!draft) return;
    const c = draft.content;
    const tags = c.hashtags.join(' ');
    const text = what === 'caption' ? c.caption : what === 'hashtags' ? tags : [c.hook, '', c.caption, '', c.cta, '', tags].join('\n').trim();
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1800); } catch { setSaveMsg({ tone: 'error', text: 'Copy is blocked by your browser.' }); }
  };

  const brandAssets = useMemo(() => ({
    businessName: (brandProfile?.businessName || workspace.name),
    palette: brandPalette(brandProfile),
    fontFamily: (brandProfile as any)?.visualIdentity?.fonts?.[0]?.family as string | undefined,
    logoUrl: brandProfile?.logoUrl || workspace.logoUrl || null,
  }), [brandProfile, workspace]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-black tracking-tight">Content Studio</h2>
          <p className="text-sm text-gray-600">Grounded in {brandProfile?.businessName || workspace.name}'s saved Brand DNA.</p>
        </div>
        <div className="flex items-center gap-2">
          {textModel && (
            <span className="text-[11px] font-mono px-2.5 py-1 rounded-full border border-gray-200 bg-white text-gray-700">
              {textModel.configured ? `Gemma 4 · ${textModel.model}` : 'Gemma 4 key not configured'}
            </span>
          )}
          <button className={ghostBtn} onClick={onOpenLibrary}><BookOpen className="w-3.5 h-3.5" /> Library</button>
        </div>
      </div>

      {/* Generator */}
      <section aria-label="Generate content" className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Platform" htmlFor="cs-platform">
            <select id="cs-platform" className={inputCls} value={platform} onChange={e => changePlatform(e.target.value as Platform)}>
              {PLATFORMS.map(p => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
            </select>
          </Field>
          <Field label="Content type" htmlFor="cs-format">
            <select id="cs-format" className={inputCls} value={format} onChange={e => setFormat(e.target.value as ContentFormat)}>
              {formats.map(f => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
            </select>
          </Field>
          <Field label="Variations" htmlFor="cs-var">
            <select id="cs-var" className={inputCls} value={variations} onChange={e => setVariations(Number(e.target.value))}>
              {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
        </div>

        <div>
          <span className="text-xs font-semibold text-gray-700">Campaign objective</span>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Campaign objective">
            {OBJECTIVES.map(o => (
              <button key={o.id} role="radio" aria-checked={objective === o.id} onClick={() => setObjective(o.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${objective === o.id ? 'bg-black text-white border-black' : 'bg-white text-gray-800 border-gray-200 hover:border-[#81171B]'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Topic" htmlFor="cs-topic" hint="Leave empty and Gemma 4 will choose from your Brand DNA.">
            <input id="cs-topic" className={inputCls} value={topic} onChange={e => setTopic(e.target.value)} maxLength={400} placeholder="e.g. Our new service launch" />
          </Field>
          <Field label="Audience" htmlFor="cs-aud">
            <input id="cs-aud" className={inputCls} value={audience} onChange={e => setAudience(e.target.value)} maxLength={400} />
          </Field>
          <Field label="Tone" htmlFor="cs-tone">
            <input id="cs-tone" className={inputCls} value={tone} onChange={e => setTone(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Language" htmlFor="cs-lang">
            <input id="cs-lang" className={inputCls} value={language} onChange={e => setLanguage(e.target.value)} maxLength={60} placeholder="English, Urdu, Roman Urdu…" />
          </Field>
          <Field label="Call to action" htmlFor="cs-cta">
            <input id="cs-cta" className={inputCls} value={cta} onChange={e => setCta(e.target.value)} maxLength={200} placeholder="e.g. Book a free call" />
          </Field>
          <Field label="Campaign name (for your Library)" htmlFor="cs-camp">
            <input id="cs-camp" className={inputCls} value={campaign} onChange={e => setCampaign(e.target.value)} maxLength={120} />
          </Field>
        </div>

        <Field label="Custom request (natural language)" htmlFor="cs-custom">
          <textarea id="cs-custom" rows={3} className={inputCls} value={customRequest} onChange={e => setCustomRequest(e.target.value)} maxLength={1500}
            placeholder="e.g. A friendly post announcing our weekend workshop, short sentences, no emojis." />
        </Field>

        {error && <Notice tone="error">{error}</Notice>}

        <div className="flex items-center gap-3">
          <button className={primaryBtn} onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? 'Generating with Gemma 4…' : 'Generate'}
          </button>
          {generating && <span className="text-xs text-gray-500">This can take up to a minute.</span>}
        </div>
      </section>

      {/* Results */}
      {draft && (
        <section aria-label="Generated content" className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2 overflow-x-auto" role="tablist" aria-label="Variations">
              {drafts.map((d, i) => (
                <button key={d.key} role="tab" aria-selected={i === active} onClick={() => setActive(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border ${i === active ? 'bg-[#81171B] text-white border-[#81171B]' : 'bg-white text-gray-800 border-gray-200 hover:border-[#81171B]'}`}>
                  {drafts.length > 1 ? `Option ${i + 1}` : 'Result'}{d.dirty ? ' •' : ''}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-gray-600">
              <StatusBadge status={draft.status} />
              {draft.modelUsed && <span className="font-mono">Text: {draft.modelUsed}</span>}
            </div>
          </div>

          <div className="p-5 sm:p-6 space-y-5">
            {draft.warnings.length > 0 && (
              <Notice tone="warn">
                <strong className="block mb-1">Please verify before publishing</strong>
                <ul className="list-disc pl-4 space-y-0.5">{draft.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </Notice>
            )}

            <div className="flex gap-2" role="tablist" aria-label="Editor view">
              {(['edit', 'preview'] as const).map(t => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${tab === t ? 'bg-black text-white border-black' : 'bg-white text-gray-800 border-gray-200'}`}>
                  {t === 'edit' ? 'Edit' : 'Creative preview'}
                </button>
              ))}
            </div>

            {tab === 'edit' ? (
              <ContentEditor
                content={draft.content}
                context={context}
                setContent={fn => updateDraft(active, d => ({ ...d, content: fn(d.content), dirty: true }))}
                onWarnings={w => updateDraft(active, d => ({ ...d, warnings: [...new Set([...d.warnings, ...w])] }))}
                onModelUsed={m => updateDraft(active, d => ({ ...d, modelUsed: m }))}
                disabled={saving}
              />
            ) : (
              <CreativePreview
                workspaceId={workspace.id}
                onImageAssetSaved={url => updateDraft(active, d => ({ ...d, imageAssetUrl: url, dirty: true }))}
                content={draft.content}
                aspectRatio={draft.aspectRatio}
                onAspectRatioChange={a => updateDraft(active, d => ({ ...d, aspectRatio: a, dirty: true }))}
                brand={brandAssets}
                imageCapability={imageCap}
              />
            )}

            {/* Review / save / export */}
            <div className="border-t border-gray-200 pt-4 space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Status" htmlFor="cs-status">
                  <select id="cs-status" className={inputCls} value={draft.status === 'published' ? 'published' : draft.status} disabled={draft.status === 'published'}
                    onChange={e => updateDraft(active, d => ({ ...d, status: e.target.value as ContentStatus, dirty: true }))}>
                    {STATUSES.filter(s => s !== 'published' || draft.status === 'published').map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </Field>
                <button className={primaryBtn} onClick={() => save()} disabled={saving || (draft.saved && !draft.dirty)}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {draft.saved ? (draft.dirty ? 'Save changes' : 'Saved') : 'Save to Library'}
                </button>
                {draft.status !== 'published' && (
                  <button className={ghostBtn} onClick={recordPublished} disabled={saving}>I published this myself</button>
                )}
                {([['caption', 'Copy caption'], ['hashtags', 'Copy hashtags'], ['all', 'Copy all']] as const).map(([k, label]) => (
                  <button key={k} className={ghostBtn} onClick={() => copy(k)}>
                    {copied === k ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />} {copied === k ? 'Copied' : label}
                  </button>
                ))}
              </div>
              {saveMsg && <Notice tone={saveMsg.tone}>{saveMsg.text}</Notice>}
              <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
                <Wand2 className="w-3 h-3" />
                NexusMark does not connect to social accounts or send email. “Published” is only set when you record it yourself.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
