import test from 'node:test';
import assert from 'node:assert/strict';
import { findCliches } from '../claimLint.ts';
import { buildImagePrompt } from '../magicDesign.ts';

test('flags stock marketing phrases and ignores specific copy', () => {
  const hits = findCliches("Unlock your potential and take your brand to the next level. It's a game-changer, seamlessly.");
  assert.ok(hits.length >= 4);
  assert.deepEqual(findCliches('Fresh whole milk, bottled the morning it is collected. Order by 6pm for next-day delivery.'), []);
});

test('a very long brief never pushes the no-text / no-fake-brand guard out of the image prompt', () => {
  const long = 'word '.repeat(600);
  const p = buildImagePrompt({ imagePrompt: long, visualDirection: long, creativeBrief: { composition: long, imagery: long, colors: [], typography: '', textOverlay: '', logoPlacement: '' } } as any, ['#112233'], 'Acme');
  assert.ok(p.length <= 1500);
  assert.match(p, /No text, letters, numbers, watermarks or logos/);
  assert.match(p, /Do not invent packaging, labels or brand marks/);
});
