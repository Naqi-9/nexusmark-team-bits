// Firestore + Storage security-rules tests. REQUIRE the Firebase emulators (Java + firebase-tools).
// NOT part of `npm test`. Run with:  npm run test:rules
// Uses a throwaway demo project: it can never touch your real Firebase project or production data.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-nexusmark-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'workspaces/wsA'), { ownerId: 'alice', name: 'A' });
    await setDoc(doc(ctx.firestore(), 'workspaces/wsB'), { ownerId: 'bob', name: 'B' });
    await setDoc(doc(ctx.firestore(), 'contentItems/itemA'), { ownerId: 'alice', workspaceId: 'wsA', status: 'draft' });
    await setDoc(doc(ctx.firestore(), 'chatMessages/msgA'), { ownerId: 'alice', workspaceId: 'wsA', role: 'user', content: 'hi' });
  });
});
const as = uid => env.authenticatedContext(uid);
const anon = () => env.unauthenticatedContext();

test('unauthenticated users cannot read or write anything', async () => {
  const db = anon().firestore();
  await assertFails(getDoc(doc(db, 'workspaces/wsA')));
  await assertFails(setDoc(doc(db, 'workspaces/new'), { ownerId: 'x' }));
  await assertFails(getDoc(doc(db, 'contentItems/itemA')));
});

test('owner can read/update/delete own workspace; others cannot', async () => {
  await assertSucceeds(getDoc(doc(as('alice').firestore(), 'workspaces/wsA')));
  await assertSucceeds(updateDoc(doc(as('alice').firestore(), 'workspaces/wsA'), { name: 'A2' }));
  await assertFails(getDoc(doc(as('bob').firestore(), 'workspaces/wsA')));
  await assertFails(updateDoc(doc(as('bob').firestore(), 'workspaces/wsA'), { name: 'pwn' }));
  await assertFails(deleteDoc(doc(as('bob').firestore(), 'workspaces/wsA')));
});

test('cannot transfer ownership or create a workspace owned by someone else', async () => {
  await assertFails(updateDoc(doc(as('alice').firestore(), 'workspaces/wsA'), { ownerId: 'bob' }));
  await assertFails(setDoc(doc(as('alice').firestore(), 'workspaces/forged'), { ownerId: 'bob' }));
  await assertSucceeds(setDoc(doc(as('alice').firestore(), 'workspaces/mine'), { ownerId: 'alice' }));
});

test('content items: owner can create in own workspace, not in another user\'s workspace', async () => {
  const db = as('alice').firestore();
  await assertSucceeds(setDoc(doc(db, 'contentItems/new1'), { ownerId: 'alice', workspaceId: 'wsA', status: 'draft' }));
  await assertFails(setDoc(doc(db, 'contentItems/new2'), { ownerId: 'alice', workspaceId: 'wsB', status: 'draft' }));
  await assertFails(setDoc(doc(db, 'contentItems/new3'), { ownerId: 'bob', workspaceId: 'wsA', status: 'draft' }));
  await assertFails(setDoc(doc(db, 'contentItems/new4'), { ownerId: 'alice', workspaceId: 'wsA', status: 'bogus' }));
});

test('content items: edit/reschedule by owner works; workspace cannot be moved; others blocked', async () => {
  const a = as('alice').firestore();
  await assertSucceeds(updateDoc(doc(a, 'contentItems/itemA'), { scheduledDate: '2026-11-02', status: 'approved' }));
  await assertFails(updateDoc(doc(a, 'contentItems/itemA'), { workspaceId: 'wsB' }));
  const b = as('bob').firestore();
  await assertFails(getDoc(doc(b, 'contentItems/itemA')));
  await assertFails(updateDoc(doc(b, 'contentItems/itemA'), { status: 'published' }));
  await assertFails(deleteDoc(doc(b, 'contentItems/itemA')));
  await assertSucceeds(deleteDoc(doc(a, 'contentItems/itemA')));
});

test('queries must be scoped to the caller (list is owner-filtered)', async () => {
  const a = as('alice').firestore();
  await assertSucceeds(getDocs(query(collection(a, 'contentItems'), where('workspaceId', '==', 'wsA'), where('ownerId', '==', 'alice'))));
  await assertFails(getDocs(query(collection(a, 'contentItems'), where('workspaceId', '==', 'wsA'))));
  await assertFails(getDocs(query(collection(a, 'contentItems'), where('ownerId', '==', 'bob'))));
});

test('chat messages without modelUsed are accepted; foreign access denied', async () => {
  const a = as('alice').firestore();
  await assertSucceeds(setDoc(doc(a, 'chatMessages/msg2'), { ownerId: 'alice', workspaceId: 'wsA', role: 'user', content: 'hello' }));
  await assertFails(getDoc(doc(as('bob').firestore(), 'chatMessages/msgA')));
});

test('unknown collections are denied even to signed-in users', async () => {
  await assertFails(setDoc(doc(as('alice').firestore(), 'secrets/x'), { ownerId: 'alice' }));
});

const png = new Uint8Array([137, 80, 78, 71]);
test('storage: owner can upload an allowed image into own workspace path', async () => {
  const s = as('alice').storage();
  await assertSucceeds(uploadBytes(ref(s, 'users/alice/workspaces/wsA/generated/a.png'), png,
    { contentType: 'image/png', customMetadata: { ownerUid: 'alice', workspaceId: 'wsA' } }));
});
test('storage: other users, wrong type, missing metadata, anonymous and arbitrary paths are denied', async () => {
  const bob = as('bob').storage();
  await assertFails(uploadBytes(ref(bob, 'users/alice/workspaces/wsA/generated/x.png'), png,
    { contentType: 'image/png', customMetadata: { ownerUid: 'bob', workspaceId: 'wsA' } }));
  const alice = as('alice').storage();
  await assertFails(uploadBytes(ref(alice, 'users/alice/workspaces/wsA/generated/x.html'), png,
    { contentType: 'text/html', customMetadata: { ownerUid: 'alice', workspaceId: 'wsA' } }));
  await assertFails(uploadBytes(ref(alice, 'users/alice/workspaces/wsA/generated/y.png'), png, { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(alice, 'random/z.png'), png, { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(anon().storage(), 'users/alice/workspaces/wsA/generated/q.png'), png,
    { contentType: 'image/png', customMetadata: { ownerUid: 'alice', workspaceId: 'wsA' } }));
});
test('storage: files over 10 MB are rejected', async () => {
  const big = new Uint8Array(10 * 1024 * 1024 + 1);
  await assertFails(uploadBytes(ref(as('alice').storage(), 'users/alice/workspaces/wsA/generated/big.png'), big,
    { contentType: 'image/png', customMetadata: { ownerUid: 'alice', workspaceId: 'wsA' } }));
});
