# NexusMark Phase 2.1: Verification Report

Environment used for this pass: Node 22.22.2, npm 10.9.7, **no network access** (registry unreachable, `npm ping` timed out),
no browser able to run the app, no Firebase credentials, no `GEMINI_API_KEY`.
Nothing was deployed. No Firebase project was contacted.

## 1. Results at a glance

| Check | Result | How |
|---|---|---|
| `npm ci` / install | **NOT RUN** (no network) | `bun.lock` is also out of sync, see 3.1 |
| `npm run build` | **NOT RUN** | needs installed deps |
| `npm run lint` (`tsc --noEmit`) | **NOT RUN** | needs installed deps. A filtered, partial type pass with a *global* TypeScript 6.0.3 found 3 real errors, now fixed (see 3.5). That is a sanity check, not the project lint |
| `npm test` | **NOT RUN as written** (needs `tsx`, `zod`, `firebase-admin`) | the runnable subset was executed directly with Node's native TS support, below |
| Automated tests actually executed | **51 pass, 0 fail** | `node --test <file>` per file |
| `contentSchemas.test.ts` | **NOT RUN** | imports `zod`, not installed |
| Firestore/Storage rules tests | **WRITTEN, NOT RUN** | need Java + Firebase emulators |
| Real Gemma / image API calls | **NOT RUN, UNVERIFIED** | no API key |
| Firebase Auth / Admin token verification against real Firebase | **NOT RUN, UNVERIFIED** | no credentials |
| Browser workflows (Content Studio, Calendar, Library, exports, Phase 1 features) | **NOT RUN, UNVERIFIED** | app cannot start without deps/Firebase |

Executed test files: `chatMessage.test.ts` 11, `content.test.ts` 8, `authMiddleware.test.ts` 16, `ssrf.test.ts` 8, `routerWiring.test.ts` 8.
These are automated unit tests with mocks. They are **not** real-API tests and **not** browser tests.

Mutation checks were done on the new guards (removing `requireOwnedWorkspace` from `/chat`, switching redirects back to `follow`,
removing `workspaceId` from the client chat payload each made the relevant test fail; originals restored).

## 2. Run these locally (in this order)

```bash
bun install            # lockfile is bun.lock; this adds firebase-admin to it. Commit the updated lock.
bun run lint           # tsc --noEmit   (report any errors back; I could not run it)
bun run test           # tsx --test ...  includes contentSchemas.test.ts (needs zod)
bun run build          # vite build
# optional, needs Java + firebase-tools + @firebase/rules-unit-testing:
npm i -D @firebase/rules-unit-testing firebase-tools
npm run test:rules
```

## 3. Problems found and root causes

### 3.1 Lockfile out of sync (not fixed, requires network)
`package.json` declares `firebase-admin` but `bun.lock` has no entry for it, so a frozen/reproducible install fails or drifts.
`esbuild ^0.25` is also declared directly while Vite 8's optional peer range is `^0.27 || ^0.28`. If `esbuild` is not imported by the
project, consider removing it. I did not edit the lockfile by hand (fabricating hashes would be worse than leaving it).

### 3.2 REGRESSION: AI Strategist and deliverable generation returned HTTP 400 (fixed)
Root cause: `/api/chat` and `/api/generate-deliverable` are guarded by `requireOwnedWorkspace`, which requires a `workspaceId`,
but `MarketingStrategist.tsx` (chat + deliverable) and `DeliverablesViewer.tsx` never sent one. Every call would have failed.
Fix: send `workspaceId: workspace.id`. Guarded by a new static client/server contract test.

### 3.3 REGRESSION: brand logo missing from creative cards (fixed)
Root cause: `CreativePreview` loaded the logo through `<img src="/api/screenshot-proxy?...">`. The proxy now requires a Bearer token,
which an `<img>` cannot send, so it would 401 and the logo would silently disappear. Fix: fetch via `authenticatedFetch`, draw from a blob URL.

### 3.4 SSRF via redirects (fixed)
Root cause: six outbound `fetch()` sites validated only the first URL and then followed redirects automatically, so a public host could
redirect to `localhost` or `169.254.169.254`. Fix: new `safeFetch` re-validates every hop (manual redirects, max 5). Applied to the page
crawler, image proxy, multimodal image ingest, logo verification and screenshot verification. `isPrivateIp` now also handles hex
IPv4-mapped IPv6 (`::ffff:7f00:1`), multicast, `192.0.0.0/24`, `198.18.0.0/15`.
Residual risk: DNS rebinding between validation and connection is not closed at the application layer. Use egress filtering for that.

### 3.5 Type errors that would fail `tsc --noEmit` (fixed)
- `StrategistError` code `'unsupported_model'` was used but not in the union.
- `generateMarketingDeliverable` returned `warning` but its return type omitted it.
- `imageAssetUrl` was used by `ContentStudio` Draft and `buildContentItem` input but missing from their types.
Also made the domain-fallback business-name derivation null-safe in `extractor.ts`.
`unsupported_model` is now also reported as non-retryable.

### 3.6 Anonymous large-body parsing (fixed)
`express.json({limit:'10mb'})` ran before authentication. Added `rejectAnonymousBeforeBodyParsing` ahead of the parser. Full verification is still
done by `requireFirebaseAuth` in the router (no double network verification).

### 3.7 Workspace-id ambiguity (hardened)
The ownership check previously used the first workspace id it found, while a handler could read another. Now every id location must agree,
ids must match `^[A-Za-z0-9_-]{1,128}$`, and conflicting/non-string ids are rejected with 400 before any Firestore read.

### 3.8 Proxy hardening
Image proxy now: allow-lists image content types, caps size at 5 MB while streaming, sets `nosniff` and a sandbox CSP (SVG cannot run script
in the app origin), and uses `Cache-Control: private` (it is an authenticated response).

## 4. API authentication and authorization audit

Verified by code reading, unit tests with a mocked verifier, and a static wiring test. **Not verified against real Firebase tokens.**

| Endpoint | Auth | Ownership |
|---|---|---|
| `GET /api/health` | **public** (only public route) | n/a. Returns status, whether a key is configured, and the model name. No secrets |
| `POST /verify-url`, `POST /scan`, `GET /content/capabilities`, `GET /screenshot-proxy` | Firebase ID token | none (no workspace exists yet / stateless) |
| `POST /chat`, `/generate-deliverable`, `/content/generate`, `/content/regenerate-section`, `/content/calendar`, `/content/regenerate-entry`, `/content/image`, `/capture-screenshot` | Firebase ID token | `requireOwnedWorkspace` (Admin Firestore lookup, `ownerId === token uid`) |

- Middleware order: `/health` is registered first, then `apiRouter.use(requireFirebaseAuth)`. A test fails if any other route precedes it.
- Router mounting: the router is mounted only by the Vite plugin for `vite dev` and `vite preview` (see `vite.config.ts`). There is **no standalone production server**.
  `npm run build` emits static assets only; the API exists only while a Vite dev/preview server runs. If you deploy static hosting alone, the API will not exist.
- Token verification uses `firebase-admin` `verifyIdToken(token, true)` (revocation checked). Identity comes only from the verified token.
- Chat, generation, calendar, image, screenshot capture are all behind ownership checks. Calendar entries, library items, deliverables and
  deletes are Firestore client operations governed by the rules, not by this API.
- **Not implemented (recommendation):** per-user rate limiting. An authenticated user can still spend your Gemini quota. Add a limiter or API gateway quota before public launch.
- The screenshot capture path sends target URLs to third-party services (mShots, Microlink) when no private renderer is configured. Disclose that or set `SCREENSHOT_SERVICE_URL`.

### Firebase Admin environment
`FIREBASE_PROJECT_ID`, `FIRESTORE_DATABASE_ID`, and either Application Default Credentials (Cloud Run: the service identity; local:
`gcloud auth application-default login` or `GOOGLE_APPLICATION_CREDENTIALS` pointing at a file **outside** the repo) or
`FIREBASE_SERVICE_ACCOUNT_JSON` as a deployment secret. `.env*` is git-ignored. No keys are committed. Also required: `GEMINI_API_KEY`.
Optional: `GEMMA_MODEL`, `IMAGE_GENERATION_MODEL`, `SCREENSHOT_SERVICE_URL`, `SCREENSHOTONE_API_KEY`.
Note: `firebase-applet-config.json` contains the public Firebase web config (API key is not a secret) and is intended to be in the client.

## 5. Firestore and Storage rules audit (no changes made, nothing deployed)

Targets (UPDATED after this report was first written: the app was moved to a new Firebase project):
- Firebase project: `nexusmark-app`
- Firestore database: `(default)` (assumed; confirm in the console)
- Storage bucket: `nexusmark-app.firebasestorage.app` (assumed; confirm in the console)
There is no `.firebaserc`, so a deploy must pass `--project nexusmark-app` explicitly. Rules were **not** deployed; paste them in the console or deploy yourself.

Reviewed by reading, **not executed** (emulator tests are written in `rules-tests/rules.test.mjs`, unrun):
- All collections require `ownerId == request.auth.uid` for read/update/delete; create requires `ownerId == uid`; list is only allowed for owner-filtered queries.
- `contentItems`: create additionally requires an owned workspace (`get()` on `workspaces`) and a valid status; `workspaceId` and `ownerId` are immutable on update.
- Unknown collections are denied. (The leading `match /{document=**}` deny block is a no-op because rules are OR-ed; the default is already deny. Harmless.)
- Storage: only `users/{uid}/workspaces/{wid}/generated/*`, uid must match, png/jpeg/webp only, under 10 MB, metadata `ownerUid`/`workspaceId` must match. Everything else denied.
- Phase 1 uses no Storage paths, so the catch-all deny should not break it.

Known gaps (not changed, to avoid breaking flows I could not test):
1. `chatMessages`, `deliverables`, `products`, etc. do not check that `workspaceId` belongs to the caller on create. Impact is limited to the caller's own data because reads are owner-filtered.
2. Storage cannot check workspace ownership (cross-service `firestore.get` does not support named databases). Objects are namespaced under the caller's uid.
3. Download URLs contain tokens and bypass read rules once issued; treat them as shared secrets.
4. No field-level schema validation in rules.
5. Firebase Storage on new buckets may require the Blaze (paid) plan. I did not check or enable anything. If the bucket does not exist, `persistGeneratedImage` fails and the image stays temporary.

## 6. Chatbot bug (`modelUsed: undefined`)

Reproduced at unit level: a payload with `modelUsed: undefined` is rejected by a fake Firestore that throws the exact original message.
Fix (already present in the project, now verified by tests): optional fields are omitted when absent; user messages never carry `modelUsed`;
placeholders (`''`, `'undefined'`, `'offline-fallback'`, ...) are never stored as attribution; reads tolerate legacy documents; retry reuses the
user message id so it cannot duplicate. Automated tests cover: normal send, assistant with real model, missing/junk model metadata, retry
idempotence, legacy documents with missing fields. **Not browser-verified:** actual Firestore write, page refresh restoring a conversation,
API-error and rate-limit UI states. No historical data was altered.

## 7. Gemma 4 and image generation: unverified

- Configured IDs: `gemma-4-26b-a4b-it` (default, override with `GEMMA_MODEL`), fallback `gemma-4-31b-it`. **I could not confirm either is accessible to your key.**
- Attribution: `executeGemmaGeneration` returns the model that actually answered, so if the primary fails and the fallback answers, the fallback id is reported.
  This is truthful, but it *is* an automatic substitution on any error, including rate limits and auth errors. Decide whether you want that.
- Rule-based paths report `fallback-rules` / `rule-based` and a non-Gemma badge; the chat client omits non-model values.
- Image generation only runs when `IMAGE_GENERATION_MODEL` is set. Imagen ids are rejected. The status endpoint reports `configured_not_verified`.
  The default in `.env.example` is blank, and the suggested `gemini-3.1-flash-image` is unverified. Brand-template canvases are labelled separately from AI images in the UI code.

Manual check (do this before trusting generation):
```bash
curl -s -H "x-goog-api-key: $GEMINI_API_KEY" "https://generativelanguage.googleapis.com/v1beta/models" | grep -o 'models/gemma[^"]*'
curl -s -H "x-goog-api-key: $GEMINI_API_KEY" -H 'Content-Type: application/json' \
  "https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent" \
  -d '{"contents":[{"parts":[{"text":"Reply with OK"}]}]}'
```
Then, with the app running and signed in, confirm `/api/content/capabilities` and generate one post; the `modelUsed` returned must equal the model you called.

## 8. Phase 2 workflows: NOT browser-tested

None of the following was run in a browser and none may be treated as verified: Content Studio generate/edit/regenerate/save/refresh,
Calendar 7-day generation and month/week/list views and reschedule, Library filter/open/duplicate/export/delete, CSV export contents,
image download, Google sign-in, website scanning, Brand DNA, SEO audit, workspaces, snapshots, logos, deliverables, AI Strategist.
Code-level pure logic (CSV building, planner, content helpers, chat persistence) is covered by `content.test.ts` and `chatMessage.test.ts`.

Suggested manual script, with two accounts (A and B): (1) sign in as A, scan a site, create a workspace; (2) Strategist: send a message, refresh, confirm it
restores; (3) generate content, edit caption, regenerate one section, save, refresh; (4) generate a 7-day calendar, move one entry, save, refresh, confirm
the others did not change; (5) Library: duplicate, export CSV, delete one item; (6) as B, request A's workspace id against `/api/chat` and expect 403, and
open A's document in the console and expect permission denied.

## 9. Files changed

Changed: `src/server/authMiddleware.ts`, `src/server/apiRouter.ts`, `src/server/ssrfValidator.ts`, `src/server/geminiService.ts`,
`src/server/logoDiscoverer.ts`, `src/server/screenshotService.ts`, `src/server/extractor.ts`, `src/components/MarketingStrategist.tsx`,
`src/components/DeliverablesViewer.tsx`, `src/components/content/CreativePreview.tsx`, `src/components/content/ContentStudio.tsx`,
`src/services/contentService.ts`, `vite.config.ts`, `package.json` (added `test:rules` script only), `tsconfig.json` (exclude `rules-tests`),
`src/server/__tests__/authMiddleware.test.ts`.
Added: `src/server/authCore.ts`, `src/server/__tests__/ssrf.test.ts`, `src/server/__tests__/routerWiring.test.ts`,
`rules-tests/rules.test.mjs`, `PHASE2_1_VERIFICATION.md`.
Not changed: `firestore.rules`, `storage.rules`, `firebase.json`, lockfile, any user data.

## 10. Remaining unverified / open

Install, lint, build; `contentSchemas` test; rules emulator tests; real Firebase token verification; real Gemma and image generation; every browser workflow;
bucket existence and billing plan; rate limiting (not implemented); no production server entry point; DNS rebinding window.
This project is **not** shown to be production-ready.
