# Phase 3 notes

## 1. Cleaner AI replies (no asterisks)
- `src/server/geminiService.ts`: the Strategist system prompt now has strict FORMAT RULES, and every reply goes through `cleanAiText()` before it is returned, so no asterisk can reach the screen, the saved history, the Copy button or the voice output.
- `src/lib/aiText.ts` (new): parser/formatter shared by server and client. Headings become UPPERCASE lines, lists become "- item" and "1. item".
- `src/components/AiMessage.tsx` (new): renders replies as headings, bullet lists, numbered steps and short paragraphs.
- Old chat history that was saved with markdown is cleaned when displayed.

## 2. Calendar auto-sync (AI Strategist -> Content Calendar)
- When the user asks for a content calendar in chat (typed, spoken, or the quick prompt), `src/lib/calendarIntent.ts` detects it, the Strategist generates real dated entries through `/api/content/calendar`, saves them to the Content Calendar as drafts, and replies with a formatted summary plus an "Open Content Calendar" button.
- Entries use ids derived from the chat message id, so Retry can never create duplicates.
- The "Content Calendar" instant deliverable button also adds its posts to the Content Calendar (no extra AI call). Blog and TikTok posts stay in Deliverables only, because the calendar does not have those channels.
- No Firestore rule changes are needed.

## 3. Magic Design (Content Studio)
- New "Magic Design" button in Content Studio: pick a calendar entry and the AI designs the post. Also available as "Magic design" inside any calendar entry.
- The picture is created from the entry's concept, visual direction, imagery and brand colors (`src/lib/magicDesign.ts`). NexusMark then draws the headline, brand name and logo on top, so text is always spelled correctly.
- The finished post is saved to Firebase Storage and attached to the calendar entry automatically (`imageAssetUrl`). Download buttons for the final post and the background.
- Needs `IMAGE_GENERATION_MODEL` on the server. Without it Magic Design says so and only the branded card template is available.

## 4. Voice assistant (AI Strategist)
- Microphone button: speak a message, it is sent automatically.
- Hands-free mode: listens, answers aloud, listens again. Say "stop" to end it.
- Voice commands: "open calendar", "open studio", "open library", "open deliverables".
- "Read replies aloud" toggle and language selector (English, Urdu, Hindi, Arabic, Spanish, French).
- Uses the browser's built-in speech recognition and speech synthesis: no new API key and no extra cost. Works in Chrome, Edge and Safari over HTTPS or localhost. Firefox has no speech recognition, so the mic is hidden there. Urdu and Hindi voices depend on what the user's device has installed.

## Tests
`npm test` now also runs `aiText.test.ts` and `calendarIntent.test.ts` (formatter, calendar intent, voice commands, image prompt, deliverable conversion).
