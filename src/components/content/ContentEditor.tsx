import React, { useEffect, useRef, useState } from 'react';
import { contentApi } from '../../lib/contentApi.ts';
import type { ContentPayload, RegenerableField } from '../../lib/contentTypes.ts';
import { Field, RegenButton, Notice, inputCls } from './ui.tsx';

interface Props {
  content: ContentPayload;
  /** Always a functional update so one section never overwrites edits made elsewhere. */
  setContent: (fn: (prev: ContentPayload) => ContentPayload) => void;
  context: unknown;
  onWarnings?: (w: string[]) => void;
  onModelUsed?: (m: string) => void;
  disabled?: boolean;
}

function HashtagsInput({ tags, onCommit, disabled }: { tags: string[]; onCommit: (t: string[]) => void; disabled?: boolean }) {
  const [text, setText] = useState(tags.join(' '));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(tags.join(' ')); }, [tags]);
  const commit = () => {
    const parsed = text.split(/[\s,]+/).map(t => t.trim()).filter(Boolean).map(t => (t.startsWith('#') ? t : `#${t}`));
    onCommit(Array.from(new Set<string>(parsed)));
  };
  return (
    <input
      id="ce-hashtags"
      className={inputCls}
      value={text}
      disabled={disabled}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; commit(); }}
      onChange={e => setText(e.target.value)}
      placeholder="#example #hashtags"
    />
  );
}

export function ContentEditor({ content, setContent, context, onWarnings, onModelUsed, disabled }: Props) {
  const [busy, setBusy] = useState<RegenerableField | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const latest = useRef(content);
  latest.current = content;

  const set = <K extends keyof ContentPayload>(key: K, value: ContentPayload[K]) =>
    setContent(prev => ({ ...prev, [key]: value }));

  const regen = async (field: RegenerableField) => {
    if (busy) return;
    setBusy(field);
    setError(null);
    try {
      const res = await contentApi.regenerateSection(context, { field, instruction, content: latest.current });
      // Merge ONLY this field; everything else the user typed meanwhile is preserved.
      setContent(prev => ({ ...prev, [field]: res.value } as ContentPayload));
      if (res.warnings?.length) onWarnings?.(res.warnings);
      if (res.modelUsed) onModelUsed?.(res.modelUsed);
    } catch (e) {
      setError((e instanceof Error ? e.message : 'Regeneration failed.') + ' Your existing text is unchanged.');
    } finally {
      setBusy(null);
    }
  };

  const lock = (f: RegenerableField) => disabled || busy === f;
  const rb = (f: RegenerableField, label: string) => (
    <RegenButton busy={busy === f} disabled={Boolean(busy) || disabled} onClick={() => regen(f)} label={label} />
  );

  const brief = content.creativeBrief;
  const setBrief = (k: keyof typeof brief, v: string) =>
    setContent(prev => ({ ...prev, creativeBrief: { ...prev.creativeBrief, [k]: v } }));

  return (
    <div className="space-y-4">
      {error && <Notice tone="error">{error}</Notice>}

      <Field label="Optional instruction for the next regeneration" htmlFor="ce-instr" hint="e.g. “shorter”, “more playful”, “mention the free consultation”. Used only when you press Regenerate.">
        <input id="ce-instr" className={inputCls} value={instruction} onChange={e => setInstruction(e.target.value)} disabled={disabled} maxLength={500} />
      </Field>

      <Field label="Title" htmlFor="ce-title" action={rb('title', 'title')}>
        <input id="ce-title" className={inputCls} value={content.title} disabled={lock('title')} onChange={e => set('title', e.target.value)} />
      </Field>

      <Field label="Audience estimate" htmlFor="ce-aud" hint="An estimate from your Brand DNA, not measured data.">
        <textarea id="ce-aud" rows={2} className={inputCls} value={content.audienceEstimate} disabled={disabled} onChange={e => set('audienceEstimate', e.target.value)} />
      </Field>

      <Field label="Creative concept" htmlFor="ce-concept" action={rb('creativeConcept', 'concept')}>
        <textarea id="ce-concept" rows={3} className={inputCls} value={content.creativeConcept} disabled={lock('creativeConcept')} onChange={e => set('creativeConcept', e.target.value)} />
      </Field>

      <Field label="Hook" htmlFor="ce-hook" action={rb('hook', 'hook')}>
        <textarea id="ce-hook" rows={2} className={inputCls} value={content.hook} disabled={lock('hook')} onChange={e => set('hook', e.target.value)} />
      </Field>

      {content.emailSubject !== undefined && (
        <Field label="Email subject" htmlFor="ce-subj">
          <input id="ce-subj" className={inputCls} value={content.emailSubject} disabled={disabled} onChange={e => set('emailSubject', e.target.value)} />
        </Field>
      )}
      {content.adHeadline !== undefined && (
        <Field label="Ad headline" htmlFor="ce-adh">
          <input id="ce-adh" className={inputCls} value={content.adHeadline} disabled={disabled} onChange={e => set('adHeadline', e.target.value)} />
        </Field>
      )}
      {content.adDescription !== undefined && (
        <Field label="Ad description" htmlFor="ce-add">
          <textarea id="ce-add" rows={2} className={inputCls} value={content.adDescription} disabled={disabled} onChange={e => set('adDescription', e.target.value)} />
        </Field>
      )}

      <Field label="Caption / copy" htmlFor="ce-cap" action={rb('caption', 'caption')}>
        <textarea id="ce-cap" rows={8} className={inputCls} value={content.caption} disabled={lock('caption')} onChange={e => set('caption', e.target.value)} />
      </Field>

      {content.carouselSlides && (
        <div className="space-y-2">
          <span className="text-xs font-semibold text-gray-700">Carousel slides</span>
          {content.carouselSlides.map((sl, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50/50">
              <input aria-label={`Slide ${i + 1} heading`} className={inputCls} value={sl.heading} disabled={disabled}
                onChange={e => setContent(prev => ({ ...prev, carouselSlides: prev.carouselSlides?.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)) }))} />
              <textarea aria-label={`Slide ${i + 1} body`} rows={2} className={inputCls} value={sl.body} disabled={disabled}
                onChange={e => setContent(prev => ({ ...prev, carouselSlides: prev.carouselSlides?.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) }))} />
            </div>
          ))}
        </div>
      )}

      {content.reelScript && (
        <div className="space-y-2">
          <span className="text-xs font-semibold text-gray-700">Reel script</span>
          {content.reelScript.map((sc, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50/50">
              {(['scene', 'voiceover', 'onScreen'] as const).map(k => (
                <input key={k} aria-label={`Scene ${i + 1} ${k}`} placeholder={k} className={inputCls} value={sc[k]} disabled={disabled}
                  onChange={e => setContent(prev => ({ ...prev, reelScript: prev.reelScript?.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) }))} />
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Call to action" htmlFor="ce-cta" action={rb('cta', 'call to action')}>
          <input id="ce-cta" className={inputCls} value={content.cta} disabled={lock('cta')} onChange={e => set('cta', e.target.value)} />
        </Field>
        <Field label="Hashtags" htmlFor="ce-hashtags" action={rb('hashtags', 'hashtags')}>
          <HashtagsInput tags={content.hashtags} disabled={lock('hashtags')} onCommit={t => set('hashtags', t)} />
        </Field>
      </div>

      <Field label="Visual direction" htmlFor="ce-vis" action={rb('visualDirection', 'visual direction')}>
        <textarea id="ce-vis" rows={2} className={inputCls} value={content.visualDirection} disabled={lock('visualDirection')} onChange={e => set('visualDirection', e.target.value)} />
      </Field>

      <Field label="Text overlay (on the image)" htmlFor="ce-ovl" action={rb('textOverlay', 'text overlay')}>
        <input id="ce-ovl" className={inputCls} value={content.textOverlay} disabled={lock('textOverlay')} onChange={e => set('textOverlay', e.target.value)} />
      </Field>

      <Field label="Image generation prompt" htmlFor="ce-img" action={rb('imagePrompt', 'image prompt')}>
        <textarea id="ce-img" rows={3} className={inputCls} value={content.imagePrompt} disabled={lock('imagePrompt')} onChange={e => set('imagePrompt', e.target.value)} />
      </Field>

      <fieldset className="border border-gray-200 rounded-xl p-4 space-y-3" disabled={lock('creativeBrief')}>
        <legend className="px-1 text-xs font-bold text-gray-800 flex items-center gap-3">
          Creative brief {rb('creativeBrief', 'creative brief')}
        </legend>
        {brief.colors.length > 0 && (
          <div className="flex items-center gap-1.5" aria-label="Brief colors">
            {brief.colors.map(c => (
              <span key={c} title={c} className="w-5 h-5 rounded-full border border-gray-200" style={{ backgroundColor: /^#[0-9a-f]{3,8}$/i.test(c) ? c : undefined }} />
            ))}
          </div>
        )}
        {([['composition', 'Composition'], ['typography', 'Typography'], ['imagery', 'Imagery'], ['textOverlay', 'Text overlay'], ['logoPlacement', 'Logo placement']] as const).map(([k, label]) => (
          <Field key={k} label={label} htmlFor={`ce-b-${k}`}>
            <input id={`ce-b-${k}`} className={inputCls} value={brief[k]} onChange={e => setBrief(k, e.target.value)} />
          </Field>
        ))}
      </fieldset>

      {content.assumptions.length > 0 && (
        <Notice tone="info">
          <strong className="block mb-1">Assumptions & estimates made by the model</strong>
          <ul className="list-disc pl-4 space-y-0.5">{content.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </Notice>
      )}
    </div>
  );
}
