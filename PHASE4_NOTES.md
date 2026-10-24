# Phase 4 notes: Content Studio real image generation

Scope: Content Studio only, plus the minimum shared code. Auth, Brand DNA, scanner, SEO, Strategist, Calendar, Library and Firestore schemas are unchanged.

## Model
- Nano Banana Pro = Gemini 3 Pro Image. Stable id **`gemini-3-pro-image`** (earlier preview id: `gemini-3-pro-image-preview`). Source: Google's Gemini API model page and pricing page.
- Paid-only per Google's pricing page (no free tier). The UI says so next to the button.
- Set with `IMAGE_GENERATION_MODEL`. Optional `IMAGE_GENERATION_SIZE` = 1K | 2K (default) | 4K.
- No automatic fallback to any other model.

## What changed
- `src/server/imageResult.ts` (new, pure): picks the final non-"thought" image from the response (Gemini 3 image models emit interim thought images, the old code took the first image part), validates format/size, classifies errors into honest key-free messages, redacts secrets from logs.
- `src/server/contentStudioService.ts`: `generateBrandImage` now sends `imageConfig {aspectRatio, imageSize}`, has its own 150 s timeout, refuses an identical in-flight request per user, and uses the new classifier. Writing rules (`WRITING_RULES`) and image-prompt rules (`IMAGE_PROMPT_RULES`) added to the Studio and Calendar prompts. JSON output shape unchanged.
- `src/lib/claimLint.ts`: `findCliches()` flags stock phrases in the existing warnings list.
- `src/lib/magicDesign.ts`: the "no text / no invented brand marks" guard can no longer be trimmed away by a long brief.
- `src/components/content/CreativePreview.tsx`: synchronous duplicate-click lock, stage text that matches real operations (generating, adding headline, saving), retry button, composition at the model's resolution, "Download image (original)" in the model's own format plus "post with headline", download error messages, broken saved-image handling.
- `src/lib/firebase.ts`, `src/services/contentService.ts`: deleting a deliverable now also deletes its Storage image (best effort, own `users/{uid}/` namespace only).
- `src/server/apiRouter.ts`, `geminiService.ts`: new error codes; permission/billing/model errors are non-retryable.

## Known limits
- Saved images use Firebase download URLs (existing design). Storage rules restrict direct reads to the owner, but the URL carries a token that works for anyone who has the link.
- After a refresh, "Download saved image" needs bucket CORS for a direct download; otherwise it opens the image in a new tab.
- Re-generating an image leaves the previous upload in Storage (only deleting the deliverable cleans up).
- Product photos are not yet passed to the model as references (needs an explicit permission control).
