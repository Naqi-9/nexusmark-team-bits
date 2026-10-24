import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIp, createSafeFetch } from '../ssrfValidator.ts';

test('isPrivateIp blocks private, loopback, metadata and mapped IPv6 forms', () => {
  for (const ip of [
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0',
    '100.64.0.1', '224.0.0.1', '255.255.255.255', '198.18.0.1',
    '::1', '::', 'fe80::1', 'fd00::1', 'fc00::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:192.168.0.1', '::ffff:169.254.169.254', '::ffff:172.16.0.1',
    '::ffff:7f00:1', '::ffff:a9fe:a9fe', '::FFFF:7F00:0001',
  ]) assert.equal(isPrivateIp(ip), true, ip);
});

test('isPrivateIp allows ordinary public addresses', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8', '::ffff:808:808'])
    assert.equal(isPrivateIp(ip), false, ip);
});

// A validator that mimics validateAndNormalizeUrl's host rules without DNS.
const validate = async (url: string) => {
  const u = new URL(url);
  if (['localhost', '169.254.169.254', '10.0.0.5'].includes(u.hostname)) return { valid: false, error: 'restricted host' };
  return { valid: true, normalizedUrl: u.toString() };
};
const redirect = (to: string, status = 302) => new Response(null, { status, headers: { location: to } });

test('safeFetch follows a safe redirect chain and returns the final response', async () => {
  const calls: string[] = [];
  const f = createSafeFetch(validate, async (u: any) => {
    calls.push(String(u));
    if (String(u) === 'https://a.example/start') return redirect('https://b.example/next');
    if (String(u) === 'https://b.example/next') return redirect('/final'); // relative redirect
    return new Response('ok', { status: 200 });
  });
  const res = await f('https://a.example/start');
  assert.equal(await res.text(), 'ok');
  assert.deepEqual(calls, ['https://a.example/start', 'https://b.example/next', 'https://b.example/final']);
});

test('SSRF: redirect from a public host to cloud metadata is blocked and never fetched', async () => {
  const calls: string[] = [];
  const f = createSafeFetch(validate, async (u: any) => {
    calls.push(String(u));
    return redirect('http://169.254.169.254/latest/meta-data/');
  });
  await assert.rejects(f('https://evil.example/x'), /restricted host/);
  assert.deepEqual(calls, ['https://evil.example/x']);
});

test('SSRF: redirect to localhost is blocked', async () => {
  const f = createSafeFetch(validate, async () => redirect('http://localhost:8080/admin', 301));
  await assert.rejects(f('https://evil.example/x'), /restricted host/);
});

test('safeFetch always disables automatic redirects', async () => {
  let seen: RequestInit | undefined;
  const f = createSafeFetch(validate, async (_u: any, init?: RequestInit) => { seen = init; return new Response('x'); });
  await f('https://a.example/');
  assert.equal(seen?.redirect, 'manual');
});

test('safeFetch stops redirect loops', async () => {
  const f = createSafeFetch(validate, async () => redirect('https://a.example/loop'));
  await assert.rejects(f('https://a.example/loop', {}, { maxRedirects: 3 }), /Too many redirects/);
});

test('safeFetch rejects an invalid initial URL without fetching', async () => {
  let fetched = false;
  const f = createSafeFetch(validate, async () => { fetched = true; return new Response('x'); });
  await assert.rejects(f('http://localhost/'), /restricted host/);
  assert.equal(fetched, false);
});
