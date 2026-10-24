import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Download, FileText, Loader2, RefreshCw, Trash2, Pencil, Files, Check } from 'lucide-react';
import type { WorkspaceRecord } from '../../services/workspaceService.ts';
import {
  PLATFORMS, PLATFORM_LABELS, FORMATS, FORMAT_LABELS, STATUSES, STATUS_LABELS,
  type ContentItemRecord, type ContentStatus,
} from '../../lib/contentTypes.ts';
import { toCsv } from '../../lib/csv.ts';
import { downloadText, slugify } from '../../lib/download.ts';
import { deleteContentItem, duplicateContentItem, fetchContentItems, updateContentItem } from '../../services/contentService.ts';
import { Field, Notice, StatusBadge, inputCls, ghostBtn } from './ui.tsx';

interface Props {
  workspace: WorkspaceRecord;
  onOpenInStudio: (item: ContentItemRecord) => void;
  onOpenInCalendar: () => void;
}

const dateOf = (i: ContentItemRecord) => i.scheduledDate || i.updatedAt.slice(0, 10);

export function libraryCsv(items: ContentItemRecord[]): string {
  return toCsv(items, [
    { header: 'Date', value: r => r.scheduledDate || '' },
    { header: 'Type', value: r => (r.kind === 'calendar' ? 'Calendar entry' : 'Studio') },
    { header: 'Platform', value: r => PLATFORM_LABELS[r.content.platform] },
    { header: 'Format', value: r => FORMAT_LABELS[r.content.format] },
    { header: 'Campaign', value: r => r.campaign },
    { header: 'Title', value: r => r.content.title },
    { header: 'Hook', value: r => r.content.hook },
    { header: 'Caption', value: r => r.content.caption },
    { header: 'Hashtags', value: r => r.content.hashtags.join(' ') },
    { header: 'CTA', value: r => r.content.cta },
    { header: 'Status', value: r => STATUS_LABELS[r.status] },
    { header: 'Model', value: r => r.modelUsed },
    { header: 'Updated', value: r => r.updatedAt },
  ]);
}

export function ContentLibrary({ workspace, onOpenInStudio, onOpenInCalendar }: Props) {
  const [items, setItems] = useState<ContentItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [fPlatform, setFPlatform] = useState('');
  const [fCampaign, setFCampaign] = useState('');
  const [fFormat, setFFormat] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await fetchContentItems(workspace.id)); }
    catch (e) { console.error('[Library] load failed', e); setError('Could not load your Content Library. Please retry.'); }
    finally { setLoading(false); }
  }, [workspace.id]);
  useEffect(() => { load(); }, [load]);

  const campaigns = useMemo(() => [...new Set(items.map(i => i.campaign).filter((c): c is string => Boolean(c)))].sort(), [items]);

  const filtered = useMemo(() => items.filter(i => {
    if (fPlatform && i.content.platform !== fPlatform) return false;
    if (fFormat && i.content.format !== fFormat) return false;
    if (fStatus && i.status !== fStatus) return false;
    if (fCampaign && i.campaign !== fCampaign) return false;
    const d = dateOf(i);
    if (fFrom && d < fFrom) return false;
    if (fTo && d > fTo) return false;
    if (q.trim()) {
      const hay = `${i.content.title} ${i.content.hook} ${i.content.caption} ${i.topic || ''}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  }), [items, fPlatform, fFormat, fStatus, fCampaign, fFrom, fTo, q]);

  const run = async (id: string, fn: () => Promise<void>, okText?: string) => {
    if (busyId) return;
    setBusyId(id); setMsg(null);
    try { await fn(); if (okText) setMsg({ tone: 'ok', text: okText }); }
    catch (e) { console.error(e); setMsg({ tone: 'error', text: 'That action failed. Nothing was changed.' }); }
    finally { setBusyId(null); }
  };

  const setStatus = (it: ContentItemRecord, status: ContentStatus) => run(it.id, async () => {
    const patch: Partial<ContentItemRecord> = { status };
    await updateContentItem(it.id, patch);
    setItems(prev => prev.map(x => (x.id === it.id ? { ...x, status, updatedAt: new Date().toISOString() } : x)));
  });

  const duplicate = (it: ContentItemRecord) => run(it.id, async () => {
    const copy = await duplicateContentItem(it);
    setItems(prev => [copy, ...prev]);
  }, 'Duplicated as a new draft.');

  const remove = (it: ContentItemRecord) => {
    if (!window.confirm(`Delete “${it.content.title || 'this item'}” permanently?`)) return;
    run(it.id, async () => { await deleteContentItem(it.id); setItems(prev => prev.filter(x => x.id !== it.id)); }, 'Deleted.');
  };

  const copyCaption = async (it: ContentItemRecord) => {
    try { await navigator.clipboard.writeText([it.content.caption, '', it.content.hashtags.join(' ')].join('\n').trim()); setCopied(it.id); setTimeout(() => setCopied(null), 1600); }
    catch { setMsg({ tone: 'error', text: 'Copy is blocked by your browser.' }); }
  };

  const clear = () => { setFPlatform(''); setFCampaign(''); setFFormat(''); setFStatus(''); setFFrom(''); setFTo(''); setQ(''); };
  const filtersOn = Boolean(fPlatform || fCampaign || fFormat || fStatus || fFrom || fTo || q);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-black tracking-tight">Content Library</h2>
          <p className="text-sm text-gray-600">Everything you saved from Content Studio and the Content Calendar.</p>
        </div>
        <div className="flex gap-2">
          <button className={ghostBtn} onClick={load}><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
          <button className={ghostBtn} disabled={filtered.length === 0} onClick={() => downloadText(`${slugify(workspace.name)}-library.csv`, libraryCsv(filtered))}>
            <Download className="w-3.5 h-3.5" /> Export CSV ({filtered.length})
          </button>
        </div>
      </div>

      <section aria-label="Filters" className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Search" htmlFor="lib-q"><input id="lib-q" className={inputCls} value={q} onChange={e => setQ(e.target.value)} placeholder="Title, hook, caption…" /></Field>
          <Field label="Platform" htmlFor="lib-p">
            <select id="lib-p" className={inputCls} value={fPlatform} onChange={e => setFPlatform(e.target.value)}>
              <option value="">All</option>{PLATFORMS.map(p => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
            </select>
          </Field>
          <Field label="Campaign" htmlFor="lib-c">
            <select id="lib-c" className={inputCls} value={fCampaign} onChange={e => setFCampaign(e.target.value)}>
              <option value="">All</option>{campaigns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Format" htmlFor="lib-f">
            <select id="lib-f" className={inputCls} value={fFormat} onChange={e => setFFormat(e.target.value)}>
              <option value="">All</option>{FORMATS.map(f => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
            </select>
          </Field>
          <Field label="Status" htmlFor="lib-s">
            <select id="lib-s" className={inputCls} value={fStatus} onChange={e => setFStatus(e.target.value)}>
              <option value="">All</option>{STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </Field>
          <Field label="From" htmlFor="lib-from"><input id="lib-from" type="date" className={inputCls} value={fFrom} onChange={e => setFFrom(e.target.value)} /></Field>
          <Field label="To" htmlFor="lib-to"><input id="lib-to" type="date" className={inputCls} value={fTo} onChange={e => setFTo(e.target.value)} /></Field>
          <div className="flex items-end">{filtersOn && <button className={ghostBtn} onClick={clear}>Clear filters</button>}</div>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">Date filters use the scheduled date for calendar entries and the last updated date for everything else.</p>
      </section>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {loading ? (
        <div className="p-10 flex items-center justify-center text-sm text-gray-500 gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading library…</div>
      ) : error ? (
        <div className="space-y-3"><Notice tone="error">{error}</Notice><button className={ghostBtn} onClick={load}><RefreshCw className="w-3.5 h-3.5" /> Retry</button></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-10 text-center space-y-2">
          <FileText className="w-6 h-6 text-gray-400 mx-auto" />
          <p className="text-sm text-gray-700 font-medium">{items.length === 0 ? 'Nothing saved yet.' : 'No items match these filters.'}</p>
          <p className="text-xs text-gray-500">{items.length === 0 ? 'Generate content in Content Studio or plan a calendar, then save it here.' : 'Try clearing a filter.'}</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {filtered.map(it => (
            <li key={it.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-2xs space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] text-gray-500">
                    {PLATFORM_LABELS[it.content.platform]} · {FORMAT_LABELS[it.content.format]}
                    {it.scheduledDate ? ` · ${it.scheduledDate}` : ''}{it.campaign ? ` · ${it.campaign}` : ''}
                  </div>
                  <h3 className="text-sm font-bold text-black truncate">{it.content.title || 'Untitled'}</h3>
                  <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">{it.content.hook || it.content.caption}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={it.status} />
                  {it.modelUsed && <span className="text-[10px] font-mono text-gray-500">{it.modelUsed}</span>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className={ghostBtn} onClick={() => onOpenInStudio(it)} disabled={busyId === it.id}><Pencil className="w-3.5 h-3.5" /> Open & edit</button>
                <button className={ghostBtn} onClick={() => duplicate(it)} disabled={Boolean(busyId)}>{busyId === it.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Files className="w-3.5 h-3.5" />} Duplicate</button>
                <button className={ghostBtn} onClick={() => copyCaption(it)}>{copied === it.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />} {copied === it.id ? 'Copied' : 'Copy'}</button>
                <button className={ghostBtn} onClick={() => downloadText(`${slugify(it.content.title)}.csv`, libraryCsv([it]))}><Download className="w-3.5 h-3.5" /> CSV</button>
                {it.kind === 'calendar' && <button className={ghostBtn} onClick={onOpenInCalendar}>View in calendar</button>}
                <label className="sr-only" htmlFor={`st-${it.id}`}>Status</label>
                <select id={`st-${it.id}`} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white" value={it.status} disabled={Boolean(busyId)}
                  onChange={e => setStatus(it, e.target.value as ContentStatus)}>
                  {STATUSES.map(s => <option key={s} value={s} disabled={s === 'published' && it.status !== 'published'}>{STATUS_LABELS[s]}{s === 'published' && it.status !== 'published' ? ' (record in Studio)' : ''}</option>)}
                </select>
                <button className={`${ghostBtn} ml-auto text-red-700`} onClick={() => remove(it)} disabled={Boolean(busyId)}><Trash2 className="w-3.5 h-3.5" /> Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
