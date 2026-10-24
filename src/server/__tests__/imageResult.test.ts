import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ImageGenError, extractImageFromResponse, classifyImageError, resolveImageSize, isNanoBananaPro, inFlightKey, redactSecrets,
} from '../imageResult.ts';

const img = (data: string, extra: Record<string, unknown> = {}) => ({ inlineData: { data, mimeType: 'image/png' }, ...extra });
const resp = (parts: unknown[], extra: Record<string, unknown> = {}) => ({ candidates: [{ content: { parts }, ...extra }] });

test('takes the last non-thought image (Gemini 3 image models emit interim thought images)', () => {
  const out = extractImageFromResponse(resp([img('AAAA', { thought: true }), { text: 'ok' }, img('BBBB', { thought: true }), img('CCCC')]));
  assert.equal(out.imageBase64, 'CCCC');
  assert.equal(out.mimeType, 'image/png');
});

test('only thought images means no usable image', () => {
  assert.throws(() => extractImageFromResponse(resp([img('AAAA', { thought: true })])), (e: any) => e instanceof ImageGenError && e.code === 'empty_response');
});

test('safety blocks and text-only answers are reported honestly', () => {
  assert.throws(() => extractImageFromResponse({ promptFeedback: { blockReason: 'SAFETY' }, candidates: [] }), (e: any) => e.code === 'blocked');
  assert.throws(() => extractImageFromResponse(resp([], { finishReason: 'IMAGE_SAFETY' })), (e: any) => e.code === 'blocked');
  assert.throws(() => extractImageFromResponse(resp([{ text: 'Sorry, I cannot' }])), (e: any) => e.code === 'empty_response' && /text instead of an image/.test(e.message));
  assert.throws(() => extractImageFromResponse(null), (e: any) => e.code === 'empty_response');
});

test('rejects unsupported formats and unreadable data', () => {
  assert.throws(() => extractImageFromResponse(resp([{ inlineData: { data: 'AAAA', mimeType: 'image/gif' } }])), (e: any) => e.code === 'invalid_output');
  assert.throws(() => extractImageFromResponse(resp([img('not base64 !!!')])), (e: any) => e.code === 'invalid_output');
  assert.equal(extractImageFromResponse(resp([{ inlineData: { data: 'AAAA', mimeType: 'image/jpeg; charset=x' } }])).mimeType, 'image/jpeg');
});

test('error classification: permissions, missing model, quota, billing, timeout, network', () => {
  const m = 'gemini-3-pro-image';
  assert.equal(classifyImageError({ message: '{"error":{"code":403,"status":"PERMISSION_DENIED"}}' }, m).code, 'permission_denied');
  assert.equal(classifyImageError({ message: 'models/x is not found for API version v1beta' }, m).code, 'model_not_found');
  assert.match(classifyImageError({ message: 'models/x is not found' }, m).message, /gemini-3-pro-image-preview/);
  assert.equal(classifyImageError({ status: 429, message: 'RESOURCE_EXHAUSTED' }, m).code, 'rate_limited');
  assert.equal(classifyImageError({ message: 'Quota exceeded ... limit: 0, model: gemini-3-pro-image' }, m).code, 'billing_required');
  assert.equal(classifyImageError({ message: 'API key not valid. Please pass a valid API key.' }, m).code, 'not_configured');
  assert.equal(classifyImageError({ message: 'request timed out' }, m).code, 'timeout');
  assert.equal(classifyImageError({ message: 'fetch failed ENOTFOUND' }, m).status, 502);
});

test('"generate" in an error message is NOT mistaken for a rate limit', () => {
  assert.equal(classifyImageError({ message: 'Could not generate content' }, 'm').code, 'generation_failed');
});

test('client-visible messages never contain raw error text or keys', () => {
  const e = classifyImageError({ message: 'boom AIzaSyA1234567890123456789012345 secret-xyz' }, 'm');
  assert.doesNotMatch(e.message, /AIza|secret-xyz|boom/);
  assert.equal(redactSecrets('key=AIzaSyA1234567890123456789012345 and abc123456', ['abc123456']), 'key=[redacted] and [redacted]');
});

test('image size: Gemini 3 only, validated, defaults to 2K', () => {
  assert.equal(resolveImageSize('gemini-3-pro-image', undefined), '2K');
  assert.equal(resolveImageSize('gemini-3-pro-image', '4k'), '4K');
  assert.equal(resolveImageSize('gemini-3-pro-image', 'huge'), '2K');
  assert.equal(resolveImageSize('gemini-2.5-flash-image', '2K'), null);
});

test('Nano Banana Pro detection and in-flight key', () => {
  assert.ok(isNanoBananaPro('gemini-3-pro-image'));
  assert.ok(isNanoBananaPro('gemini-3-pro-image-preview'));
  assert.ok(!isNanoBananaPro('gemini-3.1-flash-image'));
  assert.equal(inFlightKey('u', 'w', 'p', '1:1'), inFlightKey('u', 'w', 'p', '1:1'));
  assert.notEqual(inFlightKey('u', 'w', 'p', '1:1'), inFlightKey('u', 'w', 'p', '4:5'));
  assert.notEqual(inFlightKey('u1', 'w', 'p', '1:1'), inFlightKey('u2', 'w', 'p', '1:1'));
});
