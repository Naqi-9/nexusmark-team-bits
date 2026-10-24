import { test } from 'node:test';
import assert from 'node:assert/strict';
import { omitUndefinedDeep, findUndefinedPaths } from '../firestoreSanitize.ts';
import {
  buildChatMessageRecord,
  persistChatMessage,
  normalizeStoredChatMessage,
  normalizeModelUsed,
  type ChatMessageRecord,
} from '../chatMessage.ts';

/** Mimics Firestore's default behaviour: undefined anywhere => throw. */
function makeFakeFirestore() {
  const store = new Map<string, ChatMessageRecord>();
  const write = async (col: string, id: string, data: ChatMessageRecord) => {
    const bad = findUndefinedPaths(data);
    if (bad.length) {
      throw new Error(`Function setDoc() called with invalid data. Unsupported field value: undefined (found in field ${bad[0]} in document ${col}/${id})`);
    }
    store.set(`${col}/${id}`, structuredClone(data));
  };
  return { store, write };
}

const base = { userId: 'u1', workspaceId: 'w1' };

test('REPRO: the old payload shape is rejected like the real error', async () => {
  const { write } = makeFakeFirestore();
  const legacy = { id: 'msg_1', ownerId: 'u1', workspaceId: 'w1', role: 'user', content: 'hi',
    modelUsed: undefined, suggestedActions: undefined, createdAt: 'x' } as unknown as ChatMessageRecord;
  await assert.rejects(write('chatMessages', 'msg_1', legacy), /Unsupported field value: undefined \(found in field modelUsed/);
});

test('1. user message without modelUsed saves; field is omitted', async () => {
  const { write, store } = makeFakeFirestore();
  const rec = await persistChatMessage(write, { ...base, role: 'user', content: 'hello' });
  assert.equal('modelUsed' in rec, false);
  assert.equal('suggestedActions' in rec, false);
  assert.equal(store.size, 1);
});

test('2. assistant message with a real model id saves and keeps it', async () => {
  const { write, store } = makeFakeFirestore();
  const rec = await persistChatMessage(write, { ...base, role: 'assistant', content: 'ok', modelUsed: 'gemma-4-26b-a4b-it', suggestedActions: ['a', 'b'] });
  assert.equal(store.get(`chatMessages/${rec.id}`)?.modelUsed, 'gemma-4-26b-a4b-it');
  assert.deepEqual(rec.suggestedActions, ['a', 'b']);
});

test('3. assistant message with missing / junk model metadata never fabricates one', async () => {
  const { write } = makeFakeFirestore();
  for (const junk of [undefined, null, '', '   ', 'undefined', 'null', 'offline-fallback', 42, {}]) {
    const rec = await persistChatMessage(write, { ...base, role: 'assistant', content: 'x', modelUsed: junk });
    assert.equal('modelUsed' in rec, false, `junk ${String(junk)} must be omitted`);
  }
});

test('3b. user messages never carry a model, even if one is passed', () => {
  const rec = buildChatMessageRecord({ ...base, role: 'user', content: 'x', modelUsed: 'gemma-4-26b-a4b-it' });
  assert.equal('modelUsed' in rec, false);
});

test('4. nested undefined is removed; false/0/""/null/[] are preserved', () => {
  const out = omitUndefinedDeep({ a: undefined, b: false, c: 0, d: '', e: null, f: [], g: { h: undefined, i: 1, j: [undefined, 2, { k: undefined, l: 'z' }] } });
  assert.deepEqual(out, { b: false, c: 0, d: '', e: null, f: [], g: { i: 1, j: [2, { l: 'z' }] } });
  assert.deepEqual(findUndefinedPaths(out), []);
});

test('4b. Firestore-style sentinels, Dates and class instances are NOT corrupted', () => {
  class FieldValueLike { method = 'serverTimestamp'; }
  const sentinel = new FieldValueLike();
  const date = new Date('2026-10-24T00:00:00Z');
  const out = omitUndefinedDeep({ ts: sentinel, d: date, x: undefined });
  assert.strictEqual(out.ts, sentinel);   // same reference, not cloned
  assert.strictEqual(out.d, date);
  assert.equal('x' in out, false);
});

test('5. history loads when older docs have no modelUsed (or junk)', () => {
  const docs = [
    { id: 'a', role: 'user', content: 'q', createdAt: '2026-10-01T00:00:00Z' },
    { id: 'b', role: 'assistant', content: 'r', modelUsed: 'undefined', createdAt: '2026-10-01T00:00:01Z' },
    { id: 'c', role: 'assistant', content: 'r', modelUsed: 'gemma-4-31b-it', createdAt: '2026-10-01T00:00:02Z' },
    { id: 'bad', role: 'system', content: 'nope' },
    null,
  ].map(normalizeStoredChatMessage).filter(Boolean) as ChatMessageRecord[];
  assert.equal(docs.length, 3);
  assert.equal(docs[0].modelUsed, undefined);
  assert.equal(docs[1].modelUsed, undefined);
  assert.equal(docs[2].modelUsed, 'gemma-4-31b-it');
});

test('6. retrying with the same id overwrites instead of duplicating', async () => {
  const { write, store } = makeFakeFirestore();
  const id = 'msg_fixed_1';
  await persistChatMessage(write, { ...base, id, role: 'user', content: 'same' });
  await persistChatMessage(write, { ...base, id, role: 'user', content: 'same' });
  assert.equal(store.size, 1);
});

test('6b. a failed write does not leave a partial doc and can be retried', async () => {
  const { store } = makeFakeFirestore();
  let calls = 0;
  const flaky = async (col: string, id: string, data: ChatMessageRecord) => {
    if (++calls === 1) throw new Error('network');
    store.set(`${col}/${id}`, data);
  };
  await assert.rejects(persistChatMessage(flaky, { ...base, id: 'msg_r', role: 'user', content: 'x' }));
  await persistChatMessage(flaky, { ...base, id: 'msg_r', role: 'user', content: 'x' });
  assert.equal(store.size, 1);
});

test('8. attribution stays accurate: stored id round-trips unchanged', () => {
  assert.equal(normalizeModelUsed('  gemma-4-26b-a4b-it '), 'gemma-4-26b-a4b-it');
});
