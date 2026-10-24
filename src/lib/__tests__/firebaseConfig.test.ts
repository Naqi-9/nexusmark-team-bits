import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), 'utf8');
const web = JSON.parse(read('firebase-applet-config.json'));
const rules = JSON.parse(read('firebase.json'));
const envExample = read('.env.example');

test('web config has every field the client needs', () => {
  for (const k of ['apiKey', 'authDomain', 'projectId', 'appId', 'storageBucket', 'messagingSenderId', 'firestoreDatabaseId'])
    assert.ok(typeof web[k] === 'string' && web[k], `missing ${k}`);
});

test('authDomain, storage bucket and app id all belong to the configured project', () => {
  assert.equal(web.authDomain, `${web.projectId}.firebaseapp.com`);
  assert.ok(web.storageBucket.startsWith(`${web.projectId}.`), 'storage bucket belongs to another project');
  assert.ok(web.appId.startsWith(`1:${web.messagingSenderId}:web:`), 'appId / messagingSenderId mismatch');
});

test('server env template targets the SAME project and database as the web client', () => {
  assert.match(envExample, new RegExp(`^FIREBASE_PROJECT_ID="${web.projectId}"`, 'm'));
  const db = web.firestoreDatabaseId;
  assert.match(envExample, new RegExp(`^FIRESTORE_DATABASE_ID="${db.replace(/[()]/g, '\\$&')}"`, 'm'));
});

test('firebase.json rules target matches the client database', () => {
  const fs = rules.firestore;
  if (web.firestoreDatabaseId === '(default)') {
    assert.ok(!Array.isArray(fs) && fs.rules === 'firestore.rules');
  } else {
    assert.ok(Array.isArray(fs) && fs[0].database === web.firestoreDatabaseId);
  }
});

test('no stale project ids remain in shipped config files', () => {
  for (const f of ['firebase-applet-config.json', 'firebase.json', '.env.example', 'README.md'])
    assert.equal(/yodeling-bonbon|ai-studio-b697/.test(read(f)), false, `${f} still references the old project`);
});
