/**
 * AI reply formatting. Shared by the server (so stored/copied text is clean) and the client (rendering).
 *
 * Rules enforced here:
 *  - The asterisk character never appears in a cleaned reply.
 *  - Markdown is converted to a plain, well structured layout:
 *      headings      -> own line, UPPERCASE
 *      bullets       -> "- item"
 *      numbered list -> "1. item"
 *      paragraphs    -> short blocks separated by one blank line
 */

export type AiBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'numbered'; items: string[] };

/** Removes inline markdown and every asterisk from a fragment of text. */
export function stripInlineMarkdown(s: string): string {
  return s
    .replace(/\*{1,3}([^*\n]+?)\*{1,3}/g, '$1')
    .replace(/__([^_\n]+?)__/g, '$1')
    .replace(/`+([^`\n]*)`+/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1 ($2)')
    .replace(/\*/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

const HEADING_MD = /^\s{0,3}#{1,6}\s+(.*)$/;
const BOLD_ONLY = /^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*:?\s*$/;
const BULLET = /^\s*(?:[-*•–]|\u2022)\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,2})[.)]\s+(.*)$/;
const RULE = /^\s*(?:-{3,}|_{3,}|\*{3,}|={3,})\s*$/;
const CONTINUATION = /^\s{2,}\S/;

function isAllCapsHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 70) return false;
  if (!/[A-Z]{3}/.test(t)) return false;
  return t === t.toUpperCase() && !/[.!?]$/.test(t) && !/^[-\d]/.test(t);
}

function isColonHeading(line: string): boolean {
  const t = line.trim();
  return t.length >= 3 && t.length <= 50 && /:$/.test(t) && !/^[-•\d]/.test(t) && t.split(/\s+/).length <= 7;
}

export function parseAiText(raw: string): AiBlock[] {
  const text = (raw || '').replace(/\r\n?/g, '\n').replace(/```[a-z]*\n?/gi, '');
  const lines = text.split('\n');
  const blocks: AiBlock[] = [];
  let para: string[] = [];
  let list: { kind: 'bullets' | 'numbered'; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) { blocks.push({ type: 'paragraph', text: para.join('\n') }); para = []; }
  };
  const flushList = () => {
    if (list && list.items.length) blocks.push({ type: list.kind, items: list.items } as AiBlock);
    list = null;
  };
  const flush = () => { flushPara(); flushList(); };

  for (const line of lines) {
    if (!line.trim()) { flush(); continue; }
    if (RULE.test(line)) { flush(); continue; }

    const md = HEADING_MD.exec(line);
    if (md) { flush(); const t = stripInlineMarkdown(md[1]).replace(/:$/, ''); if (t) blocks.push({ type: 'heading', text: t.toUpperCase() }); continue; }

    const bold = BOLD_ONLY.exec(line);
    if (bold && !BULLET.test(line)) { flush(); const t = stripInlineMarkdown(bold[1]).replace(/:$/, ''); if (t) blocks.push({ type: 'heading', text: t.toUpperCase() }); continue; }

    const num = NUMBERED.exec(line);
    if (num) {
      flushPara();
      if (!list || list.kind !== 'numbered') { flushList(); list = { kind: 'numbered', items: [] }; }
      list.items.push(stripInlineMarkdown(num[2]));
      continue;
    }

    const bul = BULLET.exec(line);
    if (bul) {
      flushPara();
      if (!list || list.kind !== 'bullets') { flushList(); list = { kind: 'bullets', items: [] }; }
      list.items.push(stripInlineMarkdown(bul[1]));
      continue;
    }

    if (list && CONTINUATION.test(line)) {
      const last = list.items.length - 1;
      list.items[last] = `${list.items[last]}\n${stripInlineMarkdown(line)}`;
      continue;
    }

    const clean = stripInlineMarkdown(line);
    if (!clean) continue;
    if (isAllCapsHeading(clean) || isColonHeading(clean)) {
      flush();
      blocks.push({ type: 'heading', text: clean.replace(/:$/, '').toUpperCase() });
      continue;
    }
    flushList();
    para.push(clean);
  }
  flush();
  return blocks;
}

function indentContinuations(item: string): string {
  const [first, ...rest] = item.split('\n');
  return [first, ...rest.map(r => `   ${r}`)].join('\n');
}

/** Serialises blocks to the canonical plain-text layout (no asterisks). */
export function blocksToText(blocks: AiBlock[]): string {
  return blocks
    .map(b => {
      switch (b.type) {
        case 'heading': return b.text;
        case 'paragraph': return b.text;
        case 'bullets': return b.items.map(i => `- ${indentContinuations(i)}`).join('\n');
        case 'numbered': return b.items.map((i, n) => `${n + 1}. ${indentContinuations(i)}`).join('\n');
      }
    })
    .join('\n\n')
    .replace(/\*/g, '')
    .trim();
}

/** Canonical, asterisk-free, well structured text. Idempotent. */
export function cleanAiText(raw: string): string {
  return blocksToText(parseAiText(raw));
}

/** Text that is pleasant to read aloud: no list markers, no headings shouting. */
export function textForSpeech(raw: string): string {
  const parts: string[] = [];
  for (const b of parseAiText(raw)) {
    if (b.type === 'heading') parts.push(`${b.text.charAt(0)}${b.text.slice(1).toLowerCase()}.`);
    else if (b.type === 'paragraph') parts.push(b.text.replace(/\n/g, ' '));
    else parts.push(...b.items.map(i => `${i.replace(/\n/g, ' ')}${/[.!?]$/.test(i) ? '' : '.'}`));
  }
  return parts.join(' ').replace(/https?:\/\/\S+/g, 'link').replace(/#(\w+)/g, '$1').replace(/\s{2,}/g, ' ').trim();
}
