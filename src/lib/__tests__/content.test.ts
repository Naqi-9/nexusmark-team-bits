import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedule, addDays, monthGrid, weekDays, isValidDateString, startOfWeek, shiftMonth } from '../contentPlanner.ts';
import { toCsv, csvCell } from '../csv.ts';
import { findUnsupportedClaims } from '../claimLint.ts';
import { omitUndefinedDeep } from '../firestoreSanitize.ts';

test('dates: validation and arithmetic cross month/year/leap boundaries', () => {
  assert.equal(isValidDateString('2026-02-30'), false);
  assert.equal(isValidDateString('2028-02-29'), true);
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('dates: week starts Monday; month grid covers the whole month', () => {
  assert.equal(startOfWeek('2026-10-24'), '2026-10-19'); // Saturday -> Monday
  assert.equal(weekDays('2026-10-24').length, 7);
  const { weeks } = monthGrid('2026-10-24');
  const flat = weeks.flat();
  assert.ok(flat.includes('2026-10-01') && flat.includes('2026-10-31'));
  assert.ok(weeks.every(w => w.length === 7));
  assert.equal(shiftMonth('2026-12-15', 1), '2027-01-01');
});

test('schedule: 7 day plan uses REAL dates from the chosen start date', () => {
  const slots = buildSchedule({ startDate: '2026-10-26', days: 7, platforms: ['instagram', 'linkedin'], postsPerWeek: 5, pillars: ['Education', 'Product'] });
  assert.equal(slots.length, 5);
  assert.ok(slots.every(s => /^\d{4}-\d{2}-\d{2}$/.test(s.date)));
  assert.ok(slots.every(s => s.date >= '2026-10-26' && s.date <= '2026-11-01'));
  assert.equal(slots[0].date, '2026-10-26');
  assert.deepEqual([...new Set(slots.map(s => s.platform))].sort(), ['instagram', 'linkedin']);
  assert.ok(slots.every(s => s.format !== 'campaign'));
});

test('schedule: 30 day plan is capped and stays inside the window', () => {
  const slots = buildSchedule({ startDate: '2026-11-01', days: 30, platforms: ['instagram'], postsPerWeek: 14, pillars: [] });
  assert.ok(slots.length <= 30);
  assert.ok(slots.every(s => s.date >= '2026-11-01' && s.date <= '2026-11-30'));
  assert.equal(slots[0].pillar, 'General');
});

test('schedule: rejects bad input instead of guessing', () => {
  assert.throws(() => buildSchedule({ startDate: 'tomorrow', days: 7, platforms: ['x'], postsPerWeek: 3, pillars: [] }));
  assert.throws(() => buildSchedule({ startDate: '2026-10-26', days: 7, platforms: [], postsPerWeek: 3, pillars: [] }));
});

test('csv: escapes quotes/newlines and neutralises formula injection', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=HYPERLINK("x")').startsWith(`"'=`), true);
  assert.equal(csvCell('+1'), "'+1");
  const out = toCsv([{ d: '2026-10-26', c: 'Line1\nLine2' }], [{ header: 'Date', value: r => r.d }, { header: 'Caption', value: r => r.c }]);
  assert.equal(out, 'Date,Caption\r\n2026-10-26,"Line1\nLine2"');
});

test('claim lint: flags invented prices/discounts but allows facts present in context', () => {
  const ctx = JSON.stringify({ products: [{ name: 'Mug', price: '$12' }] });
  const w = findUnsupportedClaims('Get 40% off our Mug for $12 today. Guaranteed results!', ctx);
  assert.ok(w.some(x => x.includes('40%')));
  assert.ok(w.some(x => /Guaranteed/i.test(x)));
  assert.ok(!w.some(x => x.includes('$12')));
  assert.deepEqual(findUnsupportedClaims('Fresh ideas for your brand.', ctx), []);
});

test('content item payloads: undefined optional fields are stripped before Firestore', () => {
  const out = omitUndefinedDeep({ campaign: undefined, content: { emailSubject: undefined, hashtags: ['#a'] } });
  assert.deepEqual(out, { content: { hashtags: ['#a'] } });
});
