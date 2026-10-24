import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { STATUS_LABELS, type ContentStatus } from '../../lib/contentTypes.ts';

export const inputCls =
  'w-full bg-white border border-gray-300 focus:border-[#81171B] focus:ring-2 focus:ring-[#81171B]/15 focus:outline-none rounded-lg px-3 py-2 text-sm text-black placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-500 transition-colors';

export const primaryBtn =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#81171B] hover:bg-[#540804] text-white text-sm font-semibold shadow-2xs transition-colors disabled:opacity-40 disabled:hover:bg-[#81171B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#81171B]';

export const ghostBtn =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-[#81171B] hover:text-[#81171B] text-gray-800 text-xs font-semibold transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#81171B]';

const STATUS_STYLES: Record<ContentStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  in_review: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  published: 'bg-black text-white border-black',
};

export function StatusBadge({ status }: { status: ContentStatus }) {
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function Field({ label, htmlFor, hint, children, action }: {
  label: string; htmlFor?: string; hint?: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-xs font-semibold text-gray-700">{label}</label>
        {action}
      </div>
      {children}
      {hint && <p className="text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}

export function RegenButton({ busy, disabled, onClick, label }: { busy: boolean; disabled?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      aria-label={`Regenerate ${label}`}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#81171B] hover:underline disabled:opacity-40 disabled:no-underline"
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
      {busy ? 'Regenerating…' : 'Regenerate'}
    </button>
  );
}

export function Notice({ tone, children }: { tone: 'error' | 'warn' | 'info' | 'ok'; children: React.ReactNode }) {
  const cls = {
    error: 'bg-red-50 border-red-200 text-red-800',
    warn: 'bg-amber-50 border-amber-200 text-amber-900',
    info: 'bg-gray-50 border-gray-200 text-gray-700',
    ok: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`border rounded-lg px-3 py-2 text-xs ${cls}`}>
      {children}
    </div>
  );
}
