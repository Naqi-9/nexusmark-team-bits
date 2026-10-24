import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCalendarIntent, formatCalendarSummary, CALENDAR_SYNC_MARKER } from '../calendarIntent.ts';
import { parseVoiceCommand } from '../voice.ts';
import { buildImagePrompt, sortCalendarForMagic } from '../magicDesign.ts';
import type { ContentItemRecord } from '../contentTypes.ts';

test('detects calendar requests and ignores other questions', () => {
  assert.ok(detectCalendarIntent('Build a comprehensive 7-day multi-channel social media and content marketing calendar targeting our core buyer persona.'));
  assert.equal(detectCalendarIntent('Create a 30 day content calendar for instagram and linkedin')?.days, 30);
  assert.deepEqual(detectCalendarIntent('make a content calendar for instagram and linkedin')?.platforms, ['instagram', 'linkedin']);
  assert.equal(detectCalendarIntent('Audit my calendar strategy'), null);
  assert.equal(detectCalendarIntent('What are good hashtags?'), null);
  assert.equal(detectCalendarIntent('plan a content calendar, 3 posts per week')?.postsPerWeek, 3);
});

test('summary has no asterisks and carries the sync marker', () => {
  const text = formatCalendarSummary({
    days: 7,
    entries: [{ slot: { date: '2026-10-24', platform: 'instagram', format: 'post', pillar: 'x' }, topic: 'Launch *day*', content: { hook: 'Big **news**', title: 't' } }],
    failedDates: ['2026-10-26'],
  });
  assert.equal(text.includes('*'), false);
  assert.ok(text.includes(CALENDAR_SYNC_MARKER));
  assert.match(text, /1\. 2026-10-24 \| Instagram \| Post/);
});

test('voice commands', () => {
  assert.deepEqual(parseVoiceCommand('Open the content calendar'), { type: 'navigate', target: 'content_calendar', label: 'Content Calendar' });
  assert.equal(parseVoiceCommand('go to studio').type, 'navigate');
  assert.equal(parseVoiceCommand('stop').type, 'stop');
  assert.equal(parseVoiceCommand('how should I use my calendar to grow my instagram followers this month').type, 'none');
});

test('image prompt never asks for text and respects limits', () => {
  const p = buildImagePrompt({ imagePrompt: 'A sunny cafe table', visualDirection: 'warm', creativeBrief: { composition: 'rule of thirds', imagery: 'coffee', colors: [], typography: '', textOverlay: '', logoPlacement: '' } } as any, ['#81171B'], 'Cafe');
  assert.match(p, /No text, letters/);
  assert.match(p, /#81171B/);
  assert.ok(p.length <= 1500);
});

test('magic ordering puts upcoming first', () => {
  const mk = (id: string, d: string) => ({ id, kind: 'calendar', scheduledDate: d } as ContentItemRecord);
  const out = sortCalendarForMagic([mk('a', '2026-10-01'), mk('b', '2026-10-30'), mk('c', '2026-10-25')], '2026-10-24');
  assert.deepEqual(out.map(i => i.id), ['c', 'b', 'a']);
});

import { deliverableToCalendarEntries } from '../calendarIntent.ts';
test('deliverable calendar converts to dated entries and skips unsupported channels', () => {
  const { entries, skipped } = deliverableToCalendarEntries({
    posts: [
      { platform: 'LinkedIn', dayOrDate: 'Day 1 - Monday', hook: 'Hi **there**', fullCaption: 'Body', callToAction: 'Go', hashtags: ['#a', 'b c'], visualCreativeNote: 'Graphic', contentPillar: 'Edu' },
      { platform: 'Blog / Article', dayOrDate: 'Day 2', hook: 'x', fullCaption: 'y' },
      { platform: 'Twitter / X', dayOrDate: 'Day 3 - Wednesday', hook: 'h', fullCaption: 'c' },
    ],
  }, '2026-10-24');
  assert.equal(skipped, 1);
  assert.deepEqual(entries.map(e => [e.date, e.content.platform]), [['2026-10-24', 'linkedin'], ['2026-10-26', 'x']]);
  assert.equal(entries[0].content.hook.includes('*'), false);
  assert.deepEqual(entries[0].content.hashtags, ['#a', '#bc']);
});
