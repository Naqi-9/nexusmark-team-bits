<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/b697daa1-5215-463a-8049-ab78ad384805

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`


## Secure API and image persistence configuration

The API now requires a Firebase ID token on every endpoint except `GET /api/health`. Set `FIREBASE_PROJECT_ID` and `FIRESTORE_DATABASE_ID` to the project and Firestore database used by `firebase-applet-config.json`. On Google Cloud Run, use the hosting service account's Application Default Credentials and grant it only the required Firebase Auth token verification and Firestore read permissions. For local hosting, use Application Default Credentials via `gcloud auth application-default login`; alternatively configure `FIREBASE_SERVICE_ACCOUNT_JSON` as a deployment secret. Never commit a service account key or JSON secret.

Deploy `firestore.rules` and `storage.rules` with Firebase CLI after reviewing the project and database target. Storage uploads are optional and attempted only after a real image generation response. If the bucket is not provisioned or the upload is denied, the UI keeps the generated image in the current session and explicitly labels it temporary. The project does not enable Firebase Storage or billing automatically.

For image generation, configure `IMAGE_GENERATION_MODEL=gemini-3.1-flash-image` only after confirming that model access is available for your Google AI Studio API key. The app uses the configured model through the Gemini `generateContent` image response path and reports API errors rather than substituting a text model. The capability flag means configured, not verified; availability is verified only by a real generation request.


## Phase 3 features
See `PHASE3_NOTES.md`: asterisk-free formatted AI replies, automatic Strategist -> Content Calendar sync, Magic Design in Content Studio, and a browser voice assistant. For Magic Design to create pictures, set `IMAGE_GENERATION_MODEL` (see `.env.example`).
