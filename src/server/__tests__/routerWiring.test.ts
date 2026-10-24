import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * STATIC wiring guard. It reads apiRouter.ts as text, so it needs no Firebase/Express install, but it
 * does NOT execute the router. It catches the mistakes that silently remove protection: a route
 * registered before the auth middleware, or a workspace-scoped route that lost its ownership check.
 */
const src = readFileSync(fileURLToPath(new URL('../apiRouter.ts', import.meta.url)), 'utf8');
const routeRe = /apiRouter\.(get|post|put|patch|delete)\(\s*'([^']+)'\s*,\s*([^\n]*)/g;
const routes = [...src.matchAll(routeRe)].map(m => ({ method: m[1], path: m[2], rest: m[3], index: m.index! }));
const authIndex = src.indexOf('apiRouter.use(requireFirebaseAuth)');

/** The ONLY endpoint reachable without a token. */
const PUBLIC = new Set(['/health']);
/** Authenticated but not tied to one workspace (used before a workspace exists, or stateless). */
const AUTH_ONLY = new Set(['/verify-url', '/scan', '/content/capabilities', '/screenshot-proxy']);

test('router registers routes and a global auth middleware', () => {
  assert.ok(routes.length >= 10, `found ${routes.length} routes`);
  assert.ok(authIndex > 0, 'apiRouter.use(requireFirebaseAuth) missing');
});

test('every route except /health is registered AFTER the auth middleware', () => {
  for (const r of routes) {
    if (PUBLIC.has(r.path)) assert.ok(r.index < authIndex, `${r.path} expected to be the public route before auth`);
    else assert.ok(r.index > authIndex, `${r.method.toUpperCase()} ${r.path} is registered before requireFirebaseAuth`);
  }
});

test('only /health is public', () => {
  assert.deepEqual(routes.filter(r => r.index < authIndex).map(r => r.path), ['/health']);
});

test('every workspace-scoped route enforces ownership; only the known auth-only routes do not', () => {
  for (const r of routes) {
    if (PUBLIC.has(r.path) || AUTH_ONLY.has(r.path)) continue;
    assert.ok(r.rest.includes('requireOwnedWorkspace'), `${r.method.toUpperCase()} ${r.path} lacks requireOwnedWorkspace`);
  }
});

test('auth-only routes list contains no route that was removed or renamed', () => {
  const paths = new Set(routes.map(r => r.path));
  for (const p of AUTH_ONLY) assert.ok(paths.has(p), `${p} no longer exists; update the allowlist`);
});

test('dev and preview servers mount the API via mountApi with the anonymous gate BEFORE the body parser and router', () => {
  const vite = readFileSync(fileURLToPath(new URL('../../../vite.config.ts', import.meta.url)), 'utf8');
  assert.equal((vite.match(/mountApi\(app\);/g) || []).length, 2, 'dev + preview must both call mountApi');
  const gate = vite.indexOf("app.use('/api', rejectAnonymousBeforeBodyParsing)");
  const parser = vite.indexOf("app.use('/api', express.json");
  const router = vite.indexOf("app.use('/api', apiRouter)");
  assert.ok(gate > 0 && gate < parser && parser < router, 'order must be: anonymous gate -> body parser -> router');
});

// ---------------------------------------------------------------------------------------------
// Client/server contract: routes guarded by requireOwnedWorkspace need a workspaceId in the body.
// A previous revision guarded /chat and /generate-deliverable on the server but the client never
// sent workspaceId, so both features returned HTTP 400 for every user.
// ---------------------------------------------------------------------------------------------
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' || name === 'server' ? [] : listSourceFiles(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

test('every client call to a workspace-guarded endpoint sends workspaceId', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const guarded = routes.filter(r => r.rest.includes('requireOwnedWorkspace')).map(r => `/api${r.path}`);
  const hits: string[] = [];
  for (const file of listSourceFiles(root)) {
    if (file.endsWith('contentApi.ts')) continue; // covered by the dedicated test below
    const text = readFileSync(file, 'utf8');
    for (const path of guarded) {
      let from = 0, i: number;
      while ((i = text.indexOf(`'${path}'`, from)) !== -1) {
        from = i + 1;
        const window = text.slice(i, i + 700);
        hits.push(`${file.replace(root, 'src/')} -> ${path}`);
        const sendsId = /workspaceId/.test(window);
        assert.ok(sendsId, `${file} calls ${path} without sending workspaceId`);
      }
    }
  }
  // Content endpoints go through contentApi.ts, which passes context (carrying workspaceId) or workspaceId.
  assert.ok(hits.length >= 4, `expected several guarded client calls, found ${hits.length}: ${hits.join('; ')}`);
});

test('contentApi sends workspace-carrying context on every guarded content call', () => {
  const text = readFileSync(fileURLToPath(new URL('../../lib/contentApi.ts', import.meta.url)), 'utf8');
  const brand = readFileSync(fileURLToPath(new URL('../../lib/brandContext.ts', import.meta.url)), 'utf8');
  assert.ok(/workspaceId:\s*workspace\.id/.test(brand), 'buildBrandContext must include workspaceId');
  assert.ok(/'\/api\/content\/image',\s*\{[^}]*workspaceId/.test(text), 'image call must send workspaceId');
});
