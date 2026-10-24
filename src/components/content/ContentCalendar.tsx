import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Download, Loader2, Sparkles, X, Trash2, ExternalLink, RefreshCw, Save } from 'lucide-react';
import type { BrandProfileRecord, ProductRecord, WorkspaceRecord } from '../../services/workspaceService.ts';
import { buildBrandContext, suggestedPillars, suggestedTone } from '../../lib/brandContext.ts';
import { contentApi } from '../../lib/contentApi.ts';
import {
  PLATFORMS, PLATFORM_LABELS, FORMAT_LABELS, OBJECTIVES, STATUSES, STATUS_LABELS, ASPECT_RATIOS,
  type AspectRatio, type ContentItemRecord, type ContentPayload, type ContentStatus, type Platform,
} from '../../lib/contentTypes.ts';
import { addDays, isValidDateString, monthGrid, shiftMonth, todayInTimeZone, weekDays, startOfWeek } from '../../lib/contentPlanner.ts';
import { toCsv } from '../../lib/csv.ts';
import { downloadText } from '../../lib/download.ts';
import {
  buildContentItem, createContentItems, deleteContentItem, fetchContentItems, newContentId, updateContentItem, browserTimeZone,
} from '../../services/contentService.ts';
import { ContentEditor } from './ContentEditor.tsx';
import { Field, Notice, StatusBadge, inputCls, primaryBtn, ghostBtn } from './ui.tsx';

interface Props {
  workspace: WorkspaceRecord;
  brandProfile: BrandProfileRecord | null;
  products: ProductRecord[];
  userId: string;
  onOpenInStudio: (item: ContentItemRecord) => void;
}

type View = 'month' | 'week' | 'list';
const PLATFORM_SHORT: Record<Platform, string> = { instagram: 'IG', facebook: 'FB', linkedin: 'LI', x: 'X', paid_ads: 'Ads', email: 'Email' };

export function calendarCsv(items: ContentItemRecord[]): string {
  const rows = [...items].sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''));
  return toCsv(rows, [
    { header: 'Date', value: r => r.scheduledDate },
    { header: 'Time zone', value: r => r.timezone },
    { header: 'Platform', value: r => PLATFORM_LABELS[r.content.platform] },
    { header: 'Format', value: r => FORMAT_LABELS[r.content.format] },
    { header: 'Content pillar', value: r => r.pillar },
    { header: 'Topic', value: r => r.topic || r.content.title },
    { header: 'Hook', value: r => r.content.hook },
    { header: 'Caption', value: r => r.content.caption },
    { header: 'Hashtags', value: r => r.content.hashtags.join(' ') },
    { header: 'CTA', value: r => r.content.cta },
    { header: 'Creative brief', value: r => [r.content.creativeBrief.composition, r.content.creativeBrief.imagery, r.content.creativeBrief.textOverlay].filter(Boolean).join(' | ') },
    { header: 'Status', value: r => STATUS_LABELS[r.status] },
    { header: 'Campaign', value: r => r.campaign },
  ]);
}

export function ContentCalendar({ workspace, brandProfile, products, userId, onOpenInStudio }: Props) {
  const tz = useMemo(() => browserTimeZone(), []);
  const today = useMemo(() => todayInTimeZone(tz || undefined), [tz]);
  const context = useMemo(() => buildBrandContext(workspace, brandProfile, products), [workspace, brandProfile, products]);

  const [items, setItems] = useState<ContentItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'list' : 'month'));
  const [cursor, setCursor] = useState(today);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // generator
  const [showGen, setShowGen] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [days, setDays] = useState<7 | 30>(7);
  const [platforms, setPlatforms] = useState<Platform[]>(['instagram']);
  const [objective, setObjective] = useState<string>('engagement');
  const [postsPerWeek, setPostsPerWeek] = useState(4);
  const [pillars, setPillars] = useState(suggestedPillars(brandProfile).join(', '));
  const [themes, setThemes] = useState('');
  const [events, setEvents] = useState('');
  const [campaign, setCampaign] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState<{ tone: 'error' | 'ok' | 'warn'; text: string } | null>(null);
  const genLock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      const all = await fetchContentItems(workspace.id);
      setItems(all.filter(i => i.kind === 'calendar'));
    } catch (e) {
      console.error('[Calendar] load failed', e);
      setLoadError('Could not load your calendar. Please retry.');
    } finally { setLoading(false); }
  }, [workspace.id]);
  useEffect(() => { load(); }, [load]);

  const byDate = useMemo(() => {
    const m = new Map<string, ContentItemRecord[]>();
    for (const it of items) { if (!it.scheduledDate) continue; (m.get(it.scheduledDate) || m.set(it.scheduledDate, []).get(it.scheduledDate)!).push(it); }
    return m;
  }, [items]);

  const selected = items.find(i => i.id === selectedId) || null;

  const generate = async () => {
    if (genLock.current) return;
    if (!isValidDateString(startDate)) { setGenMsg({ tone: 'error', text: 'Choose a valid start date.' }); return; }
    if (platforms.length === 0) { setGenMsg({ tone: 'error', text: 'Select at least one platform.' }); return; }
    genLock.current = true; setGenerating(true); setGenMsg(null);
    try {
      const pillarList = pillars.split(',').map(p => p.trim()).filter(Boolean).slice(0, 8);
      const res = await contentApi.calendar(context, {
        startDate, days, platforms, postsPerWeek, objective, pillars: pillarList, themes, seasonalEvents: events,
        tone: suggestedTone(brandProfile), language: 'English', timezone: tz,
      });
      const planId = newContentId('plan'); // ids derive from planId + slot, so a retried save cannot duplicate
      const recs = res.entries.map(e => buildContentItem({
        id: `${planId}_${e.slot.index}`, userId, workspaceId: workspace.id, kind: 'calendar', content: e.content,
        aspectRatio: e.content.format === 'reel' ? '9:16' : e.content.platform === 'instagram' ? '4:5' : '1:1',
        status: 'draft', campaign: campaign || undefined, planId, pillar: e.slot.pillar, topic: e.topic,
        scheduledDate: e.slot.date, timezone: tz, modelUsed: e.modelUsed,
      }));
      await createContentItems(recs);
      setItems(prev => [...prev, ...recs]);
      setCursor(startDate);
      const missing = res.failedSlots.length;
      setGenMsg({
        tone: missing ? 'warn' : 'ok',
        text: `Saved ${recs.length} draft entr${recs.length === 1 ? 'y' : 'ies'} starting ${startDate}.` +
          (missing ? ` ${missing} slot(s) could not be generated (${res.failedSlots.map(f => f.date).join(', ')}). Run the plan again for those dates.` : ''),
      });
    } catch (e) {
      setGenMsg({ tone: 'error', text: e instanceof Error ? e.message : 'Plan generation failed. Please retry.' });
    } finally { genLock.current = false; setGenerating(false); }
  };

  const applyUpdate = (id: string, patch: Partial<ContentItemRecord>) =>
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch, updatedAt: new Date().toISOString() } : i)));

  const nav = (delta: number) => {
    if (view === 'month') setCursor(shiftMonth(cursor, delta));
    else setCursor(addDays(cursor, delta * 7));
  };

  const title = useMemo(() => {
    const [y, m] = cursor.split('-').map(Number);
    const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    if (view === 'month') return monthName;
    const wk = weekDays(cursor);
    return `${wk[0]} → ${wk[6]}`;
  }, [cursor, view]);

  const chip = (it: ContentItemRecord) => (
    <button key={it.id} onClick={() => setSelectedId(it.id)} title={it.content.title}
      className="w-full text-left text-[11px] leading-tight px-1.5 py-1 rounded bg-[#fdf3f3] border border-[#f1d4d3] hover:border-[#81171B] truncate">
      <span className="font-bold text-[#81171B]">{PLATFORM_SHORT[it.content.platform]}</span> {it.topic || it.content.title}
    </button>
  );

  const listDates = useMemo(() => [...byDate.keys()].sort(), [byDate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-black tracking-tight">Content Calendar</h2>
          <p className="text-sm text-gray-600">Dates use your time zone{tz ? ` (${tz})` : ''}. No posting times are suggested because none are proven optimal for your audience.</p>
        </div>
        <div className="flex gap-2">
          <button className={ghostBtn} onClick={() => downloadText(`${workspace.name.replace(/\W+/g, '-')}-calendar.csv`, calendarCsv(items))} disabled={items.length === 0}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button className={primaryBtn} onClick={() => setShowGen(s => !s)} aria-expanded={showGen}>
            <Sparkles className="w-4 h-4" /> {showGen ? 'Hide planner' : 'Generate plan'}
          </button>
        </div>
      </div>

      {showGen && (
        <section aria-label="Plan generator" className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="Start date" htmlFor="cc-start"><input id="cc-start" type="date" className={inputCls} value={startDate} onChange={e => setStartDate(e.target.value)} /></Field>
            <Field label="Length" htmlFor="cc-days">
              <select id="cc-days" className={inputCls} value={days} onChange={e => setDays(Number(e.target.value) as 7 | 30)}>
                <option value={7}>7 days</option><option value={30}>30 days</option>
              </select>
            </Field>
            <Field label="Posts per week" htmlFor="cc-freq" hint="Max 30 entries per plan.">
              <input id="cc-freq" type="number" min={1} max={14} className={inputCls} value={postsPerWeek} onChange={e => setPostsPerWeek(Math.min(14, Math.max(1, Number(e.target.value) || 1)))} />
            </Field>
            <Field label="Objective" htmlFor="cc-obj">
              <select id="cc-obj" className={inputCls} value={objective} onChange={e => setObjective(e.target.value)}>
                {OBJECTIVES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>
          </div>
          <fieldset>
            <legend className="text-xs font-semibold text-gray-700">Platforms</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {PLATFORMS.map(p => (
                <label key={p} className={`cursor-pointer px-3 py-1.5 rounded-full text-xs font-semibold border ${platforms.includes(p) ? 'bg-black text-white border-black' : 'bg-white text-gray-800 border-gray-200 hover:border-[#81171B]'}`}>
                  <input type="checkbox" className="sr-only" checked={platforms.includes(p)} onChange={() => setPlatforms(prev => (prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]))} />
                  {PLATFORM_LABELS[p]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Content pillars (comma separated)" htmlFor="cc-pil" hint="Prefilled from your Brand DNA content themes."><input id="cc-pil" className={inputCls} value={pillars} onChange={e => setPillars(e.target.value)} /></Field>
            <Field label="Campaign name" htmlFor="cc-camp"><input id="cc-camp" className={inputCls} value={campaign} onChange={e => setCampaign(e.target.value)} maxLength={120} /></Field>
            <Field label="Campaign themes" htmlFor="cc-themes"><input id="cc-themes" className={inputCls} value={themes} onChange={e => setThemes(e.target.value)} maxLength={500} /></Field>
            <Field label="Seasonal events (optional)" htmlFor="cc-ev" hint="Only events you list are referenced."><input id="cc-ev" className={inputCls} value={events} onChange={e => setEvents(e.target.value)} maxLength={500} /></Field>
          </div>
          {genMsg && <Notice tone={genMsg.tone}>{genMsg.text}</Notice>}
          <button className={primaryBtn} onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
            {generating ? 'Generating plan with Gemma 4…' : `Generate ${days}-day plan`}
          </button>
          {generating && <p className="text-xs text-gray-500">Longer plans are written in batches and can take a few minutes.</p>}
        </section>
      )}

      {!showGen && genMsg && <Notice tone={genMsg.tone}>{genMsg.text}</Notice>}

      <section aria-label="Calendar" className="bg-white border border-gray-200 rounded-2xl shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-1">
            <button aria-label="Previous" className={ghostBtn} onClick={() => nav(-1)}><ChevronLeft className="w-4 h-4" /></button>
            <button className={ghostBtn} onClick={() => setCursor(today)}>Today</button>
            <button aria-label="Next" className={ghostBtn} onClick={() => nav(1)}><ChevronRight className="w-4 h-4" /></button>
            <span className="ml-2 text-sm font-bold text-black">{title}</span>
          </div>
          <div className="flex gap-1" role="tablist" aria-label="Calendar view">
            {(['month', 'week', 'list'] as View[]).map(v => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize ${v === 'month' ? 'hidden sm:inline-flex' : ''} ${view === v ? 'bg-[#81171B] text-white border-[#81171B]' : 'bg-white text-gray-800 border-gray-200'}`}>{v}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-10 flex items-center justify-center text-sm text-gray-500 gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading calendar…</div>
        ) : loadError ? (
          <div className="p-6 space-y-3"><Notice tone="error">{loadError}</Notice><button className={ghostBtn} onClick={load}><RefreshCw className="w-3.5 h-3.5" /> Retry</button></div>
        ) : view === 'month' ? (
          <div className="hidden sm:block overflow-x-auto">
            <div className="grid grid-cols-7 min-w-[720px] text-[11px] font-semibold text-gray-500 border-b border-gray-200">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="px-2 py-2">{d}</div>)}
            </div>
            {(() => {
              const { weeks, month } = monthGrid(cursor);
              return weeks.map((w, wi) => (
                <div key={wi} className="grid grid-cols-7 min-w-[720px] border-b border-gray-100 last:border-0">
                  {w.map(d => {
                    const inMonth = Number(d.slice(5, 7)) - 1 === month;
                    const its = byDate.get(d) || [];
                    return (
                      <div key={d} className={`min-h-[96px] p-1.5 space-y-1 border-r border-gray-100 last:border-0 ${inMonth ? 'bg-white' : 'bg-gray-50/70'}`}>
                        <div className={`text-[11px] font-semibold ${d === today ? 'text-white bg-[#81171B] rounded-full w-5 h-5 flex items-center justify-center' : inMonth ? 'text-gray-800' : 'text-gray-400'}`}>{Number(d.slice(8))}</div>
                        {its.slice(0, 3).map(chip)}
                        {its.length > 3 && <button onClick={() => { setCursor(d); setView('week'); }} className="text-[10px] text-[#81171B] font-semibold hover:underline">+{its.length - 3} more</button>}
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        ) : view === 'week' ? (
          <div className="grid grid-cols-1 sm:grid-cols-7 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
            {weekDays(cursor).map(d => (
              <div key={d} className="p-2 space-y-1 min-h-[120px]">
                <div className={`text-[11px] font-semibold ${d === today ? 'text-[#81171B]' : 'text-gray-600'}`}>{d}</div>
                {(byDate.get(d) || []).map(chip)}
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {listDates.length === 0 && <p className="p-8 text-sm text-gray-500 text-center">No entries yet. Use “Generate plan” to create your first calendar.</p>}
            {listDates.map(d => (
              <div key={d} className="p-3 sm:p-4 space-y-2">
                <div className={`text-xs font-bold ${d === today ? 'text-[#81171B]' : 'text-gray-800'}`}>{d}{d === today ? ' · today' : ''}</div>
                {(byDate.get(d) || []).map(it => (
                  <button key={it.id} onClick={() => setSelectedId(it.id)} className="w-full text-left border border-gray-200 hover:border-[#81171B] rounded-xl p-3 flex items-start justify-between gap-3 transition-colors">
                    <div className="min-w-0">
                      <div className="text-xs text-gray-500">{PLATFORM_LABELS[it.content.platform]} · {FORMAT_LABELS[it.content.format]}{it.pillar ? ` · ${it.pillar}` : ''}</div>
                      <div className="text-sm font-semibold text-black truncate">{it.topic || it.content.title}</div>
                      <div className="text-xs text-gray-600 line-clamp-2">{it.content.hook}</div>
                    </div>
                    <StatusBadge status={it.status} />
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <EntryDrawer
          key={selected.id}
          item={selected}
          context={context}
          tone={suggestedTone(brandProfile)}
          objective={selected.content.objective || objective}
          onClose={() => setSelectedId(null)}
          onSaved={(patch) => applyUpdate(selected.id, patch)}
          onDeleted={() => { setItems(prev => prev.filter(i => i.id !== selected.id)); setSelectedId(null); }}
          onOpenInStudio={onOpenInStudio}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function EntryDrawer({ item, context, tone, objective, onClose, onSaved, onDeleted, onOpenInStudio }: {
  item: ContentItemRecord; context: unknown; tone: string; objective: string;
  onClose: () => void; onSaved: (p: Partial<ContentItemRecord>) => void; onDeleted: () => void; onOpenInStudio: (i: ContentItemRecord) => void;
}) {
  const [content, setContent] = useState<ContentPayload>(item.content);
  const [date, setDate] = useState(item.scheduledDate || '');
  const [status, setStatus] = useState<ContentStatus>(item.status);
  const [pillar, setPillar] = useState(item.pillar || '');
  const [topic, setTopic] = useState(item.topic || '');
  const [aspect, setAspect] = useState<AspectRatio>(item.aspectRatio);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'save' | 'regen' | 'delete' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const lock = useRef(false);

  const mark = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true); };

  const save = async (): Promise<boolean> => {
    if (lock.current) return false;
    if (!isValidDateString(date)) { setMsg({ tone: 'error', text: 'Choose a valid date.' }); return false; }
    lock.current = true; setBusy('save'); setMsg(null);
    try {
      const patch: Partial<ContentItemRecord> = { content, scheduledDate: date, status, pillar: pillar || undefined, topic: topic || undefined, aspectRatio: aspect };
      if (status === 'published' && !item.publishedRecordedAt) patch.publishedRecordedAt = new Date().toISOString();
      await updateContentItem(item.id, patch); // touches ONLY this document
      onSaved(patch); setDirty(false); setMsg({ tone: 'ok', text: 'Entry saved. Other entries were not changed.' });
      return true;
    } catch (e) {
      console.error(e); setMsg({ tone: 'error', text: 'Could not save this entry. Your edits are still here.' });
      return false;
    } finally { lock.current = false; setBusy(null); }
  };

  const openInStudio = async () => {
    // Save first so the Studio always opens exactly what is stored; if saving fails, stay here.
    if (dirty && !(await save())) return;
    onOpenInStudio({ ...item, content, status, aspectRatio: aspect, scheduledDate: date, pillar: pillar || item.pillar, topic: topic || item.topic });
  };

  const regenerate = async () => {
    if (lock.current) return;
    if (!window.confirm('Replace this entry’s text with a freshly generated version? Your current edits to it will be replaced (nothing is saved until you press Save).')) return;
    lock.current = true; setBusy('regen'); setMsg(null);
    try {
      const res = await contentApi.regenerateEntry(context, { date: date || item.scheduledDate, platform: content.platform, format: content.format, pillar: pillar || 'General', objective, instruction: '', tone, language: 'English' });
      setContent(res.content); setTopic(res.topic); setWarnings(res.warnings); setDirty(true);
      setMsg({ tone: 'ok', text: 'New version generated. Review it, then Save.' });
    } catch (e) {
      setMsg({ tone: 'error', text: (e instanceof Error ? e.message : 'Regeneration failed.') + ' The entry is unchanged.' });
    } finally { lock.current = false; setBusy(null); }
  };

  const remove = async () => {
    if (lock.current) return;
    if (!window.confirm('Delete this calendar entry permanently?')) return;
    lock.current = true; setBusy('delete');
    try { await deleteContentItem(item.id); onDeleted(); }
    catch { setMsg({ tone: 'error', text: 'Could not delete this entry.' }); }
    finally { lock.current = false; setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label="Edit calendar entry">
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-gray-500">{PLATFORM_LABELS[content.platform]} · {FORMAT_LABELS[content.format]}</div>
            <div className="text-sm font-bold text-black truncate">{content.title || 'Entry'}</div>
          </div>
          <button aria-label="Close" className={ghostBtn} onClick={() => { if (!dirty || window.confirm('Close without saving your changes?')) onClose(); }}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Date (reschedule)" htmlFor="ed-date"><input id="ed-date" type="date" className={inputCls} value={date} onChange={e => mark(setDate)(e.target.value)} /></Field>
            <Field label="Status" htmlFor="ed-status">
              <select id="ed-status" className={inputCls} value={status} onChange={e => mark(setStatus)(e.target.value as ContentStatus)}>
                {STATUSES.map(s => <option key={s} value={s} disabled={s === 'published' && item.status !== 'published'}>{STATUS_LABELS[s]}{s === 'published' && item.status !== 'published' ? ' (record from Content Studio)' : ''}</option>)}
              </select>
            </Field>
            <Field label="Content pillar" htmlFor="ed-pillar"><input id="ed-pillar" className={inputCls} value={pillar} onChange={e => mark(setPillar)(e.target.value)} /></Field>
            <Field label="Format" htmlFor="ed-ar">
              <select id="ed-ar" className={inputCls} value={aspect} onChange={e => mark(setAspect)(e.target.value as AspectRatio)}>
                {(Object.keys(ASPECT_RATIOS) as AspectRatio[]).map(r => <option key={r} value={r}>{ASPECT_RATIOS[r].label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Topic" htmlFor="ed-topic"><input id="ed-topic" className={inputCls} value={topic} onChange={e => mark(setTopic)(e.target.value)} /></Field>

          {warnings.length > 0 && <Notice tone="warn"><ul className="list-disc pl-4">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></Notice>}

          <ContentEditor content={content} context={context} disabled={busy !== null}
            setContent={fn => { setContent(fn); setDirty(true); }} onWarnings={w => setWarnings(prev => [...new Set([...prev, ...w])])} />

          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

          <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4">
            <button className={primaryBtn} onClick={save} disabled={busy !== null || !dirty}>{busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save entry</button>
            <button className={ghostBtn} onClick={regenerate} disabled={busy !== null}>{busy === 'regen' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Regenerate entry</button>
            <button className={ghostBtn} onClick={openInStudio} disabled={busy !== null}><ExternalLink className="w-3.5 h-3.5" /> Open in Content Studio</button>
            <button className={`${ghostBtn} ml-auto text-red-700`} onClick={remove} disabled={busy !== null}><Trash2 className="w-3.5 h-3.5" /> Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}
