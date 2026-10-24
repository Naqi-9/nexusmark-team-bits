import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseAuthMiddleware, createWorkspaceOwnershipMiddleware, extractWorkspaceIds, rejectAnonymousBeforeBodyParsing } from '../authCore.ts';

function mockResponse() {
  const result: { statusCode: number; body: any } = { statusCode: 200, body: null };
  const res: any = {
    status(code: number) { result.statusCode = code; return this; },
    json(body: unknown) { result.body = body; return this; },
  };
  return { res, result };
}
function mockRequest(authorization?: string, body: any = {}) {
  return { header: (name: string) => name.toLowerCase() === 'authorization' ? authorization : undefined, body } as any;
}
const shouldNotRun = () => { throw new Error('next should not run'); };

// ---------------- token verification ----------------
test('missing Authorization header returns 401 and never calls the verifier', async () => {
  const { res, result } = mockResponse();
  let verified = false;
  const mw = createFirebaseAuthMiddleware(async () => { verified = true; return { uid: 'u1' }; });
  await mw(mockRequest(undefined), res, shouldNotRun);
  assert.equal(result.statusCode, 401);
  assert.equal(result.body.code, 'missing_token');
  assert.equal(verified, false);
});

test('malformed Authorization headers return 401 without verifying', async () => {
  for (const header of ['Basic abc', 'Bearer', 'Bearer ', 'token-only', 'Bearer\t']) {
    const { res, result } = mockResponse();
    let verified = false;
    const mw = createFirebaseAuthMiddleware(async () => { verified = true; return { uid: 'u1' }; });
    await mw(mockRequest(header), res, shouldNotRun);
    assert.equal(result.statusCode, 401, `header ${JSON.stringify(header)}`);
    assert.equal(verified, false, `header ${JSON.stringify(header)}`);
  }
});

test('invalid, expired and revoked tokens return 401', async () => {
  for (const reason of ['invalid signature', 'auth/id-token-expired', 'auth/id-token-revoked']) {
    const { res, result } = mockResponse();
    const mw = createFirebaseAuthMiddleware(async () => { throw new Error(reason); });
    await mw(mockRequest('Bearer some.jwt.value'), res, shouldNotRun);
    assert.equal(result.statusCode, 401);
    assert.equal(result.body.code, 'invalid_token');
    // internal verifier error text must not leak to the client
    assert.equal(JSON.stringify(result.body).includes(reason), false);
  }
});

test('verifier returning no uid is rejected', async () => {
  const { res, result } = mockResponse();
  const mw = createFirebaseAuthMiddleware(async () => ({ uid: '' }));
  await mw(mockRequest('Bearer x'), res, shouldNotRun);
  assert.equal(result.statusCode, 401);
});

test('token is verified with revocation checking enabled', async () => {
  const { res } = mockResponse();
  let seen: { token: string; checkRevoked: boolean } | null = null;
  const mw = createFirebaseAuthMiddleware(async (token, checkRevoked) => { seen = { token, checkRevoked }; return { uid: 'u1' }; });
  await mw(mockRequest('bearer   abc.def.ghi'), res, () => {});
  assert.deepEqual(seen, { token: 'abc.def.ghi', checkRevoked: true });
});

test('identity comes from the verified token, never from client-supplied fields', async () => {
  const { res } = mockResponse();
  const req = mockRequest('Bearer valid', { userId: 'victim', uid: 'victim', ownerId: 'victim', firebaseUser: { uid: 'victim' } });
  const mw = createFirebaseAuthMiddleware(async () => ({ uid: 'real-user', email: 'a@b.c' }));
  let ran = false;
  await mw(req, res, () => { ran = true; });
  assert.equal(ran, true);
  assert.equal(req.firebaseUser.uid, 'real-user');
});

// ---------------- workspace ownership ----------------
test('cross-user workspace access returns 403', async () => {
  const { res, result } = mockResponse();
  const req = mockRequest('Bearer token', { context: { workspaceId: 'ws-other' } });
  req.firebaseUser = { uid: 'attacker' };
  const mw = createWorkspaceOwnershipMiddleware(async () => 'victim');
  await mw(req, res, shouldNotRun);
  assert.equal(result.statusCode, 403);
  assert.equal(result.body.code, 'workspace_forbidden');
});

test('nonexistent workspace returns 403 (does not reveal existence)', async () => {
  const { res, result } = mockResponse();
  const req = mockRequest('Bearer token', { workspaceId: 'ws-missing' });
  req.firebaseUser = { uid: 'u1' };
  await createWorkspaceOwnershipMiddleware(async () => null)(req, res, shouldNotRun);
  assert.equal(result.statusCode, 403);
});

test('request without authenticated user cannot pass ownership even if owner lookup matches undefined', async () => {
  const { res, result } = mockResponse();
  const req = mockRequest(undefined, { workspaceId: 'ws1' }); // firebaseUser unset: auth middleware did not run
  await createWorkspaceOwnershipMiddleware(async () => 'u1')(req, res, shouldNotRun);
  assert.equal(result.statusCode, 403);
});

test('authorized workspace request proceeds from every supported location', async () => {
  const bodies = [
    { workspaceId: 'ws-owned' },
    { context: { workspaceId: 'ws-owned' } },
    { request: { context: { workspaceId: 'ws-owned' } } },
    { input: { context: { workspaceId: 'ws-owned' } } },
    { workspaceContext: { workspaceId: 'ws-owned' } },
  ];
  for (const body of bodies) {
    const { res, result } = mockResponse();
    const req = mockRequest('Bearer token', body);
    req.firebaseUser = { uid: 'owner' };
    let passed = false;
    await createWorkspaceOwnershipMiddleware(async id => id === 'ws-owned' ? 'owner' : null)(req, res, () => { passed = true; });
    assert.equal(passed, true, JSON.stringify(body));
    assert.equal(result.statusCode, 200);
  }
});

test('missing workspaceId returns 400', async () => {
  const { res, result } = mockResponse();
  const req = mockRequest('Bearer token', {});
  req.firebaseUser = { uid: 'u1' };
  await createWorkspaceOwnershipMiddleware(async () => 'u1')(req, res, shouldNotRun);
  assert.equal(result.statusCode, 400);
  assert.equal(result.body.code, 'workspace_required');
});

test('conflicting workspace ids (own id in one field, victim id in another) are rejected', async () => {
  const { res, result } = mockResponse();
  let lookedUp = false;
  const req = mockRequest('Bearer token', { workspaceId: 'mine', context: { workspaceId: 'victims' } });
  req.firebaseUser = { uid: 'attacker' };
  await createWorkspaceOwnershipMiddleware(async () => { lookedUp = true; return 'attacker'; })(req, res, shouldNotRun);
  assert.equal(result.statusCode, 400);
  assert.equal(result.body.code, 'workspace_ambiguous');
  assert.equal(lookedUp, false);
});

test('non-string / path-like workspace ids are rejected before any Firestore lookup', async () => {
  for (const bad of [123, ['a'], { id: 'x' }, 'a/b', '../users/victim', 'a b', 'x'.repeat(200), '']) {
    const { res, result } = mockResponse();
    let lookedUp = false;
    const req = mockRequest('Bearer token', { workspaceId: bad });
    req.firebaseUser = { uid: 'u1' };
    await createWorkspaceOwnershipMiddleware(async () => { lookedUp = true; return 'u1'; })(req, res, shouldNotRun);
    assert.equal(result.statusCode, 400, JSON.stringify(bad));
    assert.equal(lookedUp, false, JSON.stringify(bad));
  }
});

test('Firestore failure during ownership check returns retryable 503, not access', async () => {
  const { res, result } = mockResponse();
  const req = mockRequest('Bearer token', { workspaceId: 'ws1' });
  req.firebaseUser = { uid: 'u1' };
  await createWorkspaceOwnershipMiddleware(async () => { throw new Error('firestore down'); })(req, res, shouldNotRun);
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.retryable, true);
});

test('extractWorkspaceIds handles odd bodies', () => {
  assert.deepEqual(extractWorkspaceIds(undefined), { ids: [], malformed: false });
  assert.deepEqual(extractWorkspaceIds({ workspaceId: 'a', context: { workspaceId: 'a' } }).ids, ['a', 'a']);
});

test('anonymous gate: only /health passes without a Bearer credential', () => {
  const run = (path: string, authorization?: string) => {
    const { res, result } = mockResponse();
    let passed = false;
    const req: any = { path, header: (n: string) => n.toLowerCase() === 'authorization' ? authorization : undefined };
    rejectAnonymousBeforeBodyParsing(req, res, () => { passed = true; });
    return { passed, status: result.statusCode };
  };
  assert.equal(run('/health').passed, true);
  assert.deepEqual(run('/scan'), { passed: false, status: 401 });
  assert.deepEqual(run('/content/generate', 'Basic abc'), { passed: false, status: 401 });
  assert.deepEqual(run('/chat', 'Bearer '), { passed: false, status: 401 });
  assert.equal(run('/chat', 'Bearer abc.def').passed, true); // still fully verified later by requireFirebaseAuth
});
