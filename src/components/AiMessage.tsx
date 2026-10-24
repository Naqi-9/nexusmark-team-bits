import React, { useMemo } from 'react';
import { parseAiText } from '../lib/aiText.ts';

/** Renders an AI reply as clean, structured blocks. Never shows markdown symbols or asterisks. */
export function AiMessage({ text }: { text: string }) {
  const blocks = useMemo(() => parseAiText(text), [text]);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-gray-900">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading':
            return (
              <h4 key={i} className="pt-1 first:pt-0 text-[11px] font-bold tracking-wider text-[#81171B] border-b border-gray-200 pb-1">
                {b.text}
              </h4>
            );
          case 'bullets':
            return (
              <ul key={i} className="space-y-1.5">
                {b.items.map((it, n) => (
                  <li key={n} className="flex gap-2">
                    <span aria-hidden className="mt-2 w-1.5 h-1.5 rounded-full bg-[#81171B] shrink-0" />
                    <span className="whitespace-pre-line">{it}</span>
                  </li>
                ))}
              </ul>
            );
          case 'numbered':
            return (
              <ol key={i} className="space-y-2">
                {b.items.map((it, n) => (
                  <li key={n} className="flex gap-2.5">
                    <span className="shrink-0 w-5 h-5 mt-0.5 rounded-full bg-[#81171B] text-white text-[11px] font-bold flex items-center justify-center">{n + 1}</span>
                    <span className="whitespace-pre-line">{it}</span>
                  </li>
                ))}
              </ol>
            );
          default:
            return <p key={i} className="whitespace-pre-line">{b.text}</p>;
        }
      })}
    </div>
  );
}
