import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanAiText, parseAiText, textForSpeech } from '../aiText.ts';

const MD = `## Content Strategy
Here is **the plan** for *your* brand.

* **Hook:** Start strong
* Caption: keep it short
  with a second line

1. **Post** on Monday
2. Reply to comments

**Next Steps**
---
Done.`;

test('cleanAiText never outputs an asterisk', () => {
  const out = cleanAiText(MD);
  assert.equal(out.includes('*'), false);
  assert.equal(cleanAiText('2 * 3 and ***bold*** and **x**').includes('*'), false);
});

test('headings become uppercase lines, lists become dash and numbered lists', () => {
  const out = cleanAiText(MD);
  assert.match(out, /^CONTENT STRATEGY\n\nHere is the plan for your brand\./);
  assert.match(out, /- Hook: Start strong\n- Caption: keep it short\n   with a second line/);
  assert.match(out, /1\. Post on Monday\n2\. Reply to comments/);
  assert.match(out, /\n\nNEXT STEPS\n\nDone\.$/);
});

test('cleanAiText is idempotent', () => {
  const once = cleanAiText(MD);
  assert.equal(cleanAiText(once), once);
});

test('parseAiText returns structured blocks', () => {
  const blocks = parseAiText(cleanAiText(MD));
  assert.deepEqual(blocks.map(b => b.type), ['heading', 'paragraph', 'bullets', 'numbered', 'heading', 'paragraph']);
});

test('speech text has no markers', () => {
  const s = textForSpeech(MD);
  assert.equal(/[*#]|^- /.test(s), false);
  assert.match(s, /Content strategy\./);
});
