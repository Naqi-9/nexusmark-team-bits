# Phase 2 notes

## Root cause of the Firestore error
`saveChatMessage()` built `{ modelUsed: params.modelUsed, suggestedActions: params.suggestedActions, ... }`.
The Strategist saves the **user's** message first and never passes a model, so `modelUsed` was `undefined`
on every send. Firestore rejects `undefined`, `setDoc` threw, and the whole turn failed before Gemma was even called.

## What changed (Priority 0)
- `src/lib/firestoreSanitize.ts` NEW  recursive undefined-stripper that leaves sentinels/Timestamps/Dates untouched
- `src/lib/chatMessage.ts` NEW  typed builder (optional fields omitted, never `undefined`/`''`/`"undefined"`), tolerant reader
- `src/services/workspaceService.ts`  saveChatMessage/fetchChatMessages use the above (stable ids => retries overwrite, never duplicate)
- `src/components/MarketingStrategist.tsx`  isolated persistence, Retry button, no fabricated model attribution
- `src/server/geminiService.ts`  chat no longer returns a fake "offline" reply as if it were an answer; throws typed errors
- `src/server/apiRouter.ts`  /api/chat returns proper 429/503/504/502 with `retryable`

## Phase 2
- Server: `contentSchemas.ts`, `contentStudioService.ts`, routes `/api/content/*` in `apiRouter.ts`
- Client: `components/content/{ContentStudio,ContentCalendar,ContentLibrary,ContentEditor,CreativePreview,ui}.tsx`,
  `services/contentService.ts`, `lib/{contentTypes,contentPlanner,contentApi,brandContext,csv,claimLint,download}.ts`
- Dashboard: three new tabs (Content Studio / Content Calendar / Content Library)
- `firestore.rules`: new `contentItems` collection (owner checks + workspace ownership check on create) — **must be deployed**
- `firebase-blueprint.json`: `ContentItem` entity

## Config
- `GEMINI_API_KEY` (existing), `GEMMA_MODEL` (existing)
- `IMAGE_GENERATION_MODEL` (new, optional). Unset => no AI graphics, UI says so.

## Tests
`npm test` runs `node --test src/lib/__tests__/*.test.ts` (needs Node 22.18+; no extra dependencies).


## Security implementation follow-up
- API router middleware verifies Firebase ID tokens server-side with Firebase Admin and checks workspace ownership on chat, deliverable generation, Content Studio/Calendar, image generation, and screenshot capture.
- The health endpoint is intentionally public and returns only basic service status. All other `/api` endpoints require authentication.
- `storage.rules` restricts generated assets to the authenticated user's own namespace, validates image MIME types and size, and checks workspace metadata. A configured bucket in app config is not proof the bucket exists or is enabled.
- Model attribution uses `rule-based` for local fallback analysis. `fallback-rules` deliverables are labeled as rule-based, not Gemma-generated.
