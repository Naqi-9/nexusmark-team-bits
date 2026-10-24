import { applicationDefault, getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createFirebaseAuthMiddleware, createWorkspaceOwnershipMiddleware } from './authCore.ts';

export { createFirebaseAuthMiddleware, createWorkspaceOwnershipMiddleware } from './authCore.ts';

function getAdminApp() {
  const existing = getApps()[0];
  if (existing) return existing;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  // Cloud Run / Google hosting should use Application Default Credentials. Explicit JSON
  // credentials are supported only through environment variables, never committed files.
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    const parsed = JSON.parse(raw);
    return initializeApp({ credential: cert(parsed), projectId: projectId || parsed.project_id });
  }
  return initializeApp({ credential: applicationDefault(), ...(projectId ? { projectId } : {}) });
}

export function getAdminFirestore() {
  const app = getAdminApp();
  const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';
  return databaseId === '(default)' ? getFirestore(app) : getFirestore(app, databaseId);
}

export const requireFirebaseAuth = createFirebaseAuthMiddleware((token, checkRevoked) =>
  getAuth(getAdminApp()).verifyIdToken(token, checkRevoked)
);

export const requireOwnedWorkspace = createWorkspaceOwnershipMiddleware(async (workspaceId) => {
  const snap = await getAdminFirestore().collection('workspaces').doc(workspaceId).get();
  const ownerId = snap.exists ? snap.data()?.ownerId : undefined;
  return typeof ownerId === 'string' ? ownerId : null;
});
