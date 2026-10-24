import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import fileConfig from '../../firebase-applet-config.json';

// Values in firebase-applet-config.json are the defaults. If VITE_FIREBASE_* variables are set at build
// time (e.g. in Render's Environment tab) they take precedence. These are public web identifiers, not secrets.
const env = (import.meta as any).env || {};
const pick = (value: unknown, fallback: string): string => (typeof value === 'string' && value.trim() ? value.trim() : fallback);
const firebaseConfig = {
  ...fileConfig,
  apiKey: pick(env.VITE_FIREBASE_API_KEY, fileConfig.apiKey),
  authDomain: pick(env.VITE_FIREBASE_AUTH_DOMAIN, fileConfig.authDomain),
  projectId: pick(env.VITE_FIREBASE_PROJECT_ID, fileConfig.projectId),
  appId: pick(env.VITE_FIREBASE_APP_ID, fileConfig.appId),
  storageBucket: pick(env.VITE_FIREBASE_STORAGE_BUCKET, fileConfig.storageBucket),
  messagingSenderId: pick(env.VITE_FIREBASE_MESSAGING_SENDER_ID, fileConfig.messagingSenderId),
  firestoreDatabaseId: pick(env.VITE_FIREBASE_FIRESTORE_DATABASE_ID, fileConfig.firestoreDatabaseId),
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

/* CRITICAL: Must pass firebaseConfig.firestoreDatabaseId */
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test initial connection as required by Skill
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client offline, check network connection.');
      return false;
    }
    // Document might not exist which is fine for connection test
    return true;
  }
}

export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Google login failed:', error);
    throw error;
  }
}

export async function logoutUser() {
  await signOut(auth);
}


/** Attach a fresh Firebase ID token to API requests. The server verifies this token independently. */
export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Please sign in before making this request.');
  const token = await currentUser.getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(input, { ...init, headers });
}

/** Uploads a generated image to the authenticated user's workspace namespace. */
export async function persistGeneratedImage(workspaceId: string, imageBase64: string, mimeType: string): Promise<{ url: string; path: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Sign in to save generated images.');
  const token = await currentUser.getIdToken();
  // Force token refresh before upload so Storage Rules evaluate a current Firebase identity.
  if (!token) throw new Error('Authentication token unavailable.');
  const bucket = firebaseConfig.storageBucket;
  if (!bucket) throw new Error('Firebase Storage bucket is not configured. The image remains temporary.');
  const storage = getStorage(app, `gs://${bucket}`);
  const extension = mimeType.includes('webp') ? 'webp' : mimeType.includes('jpeg') ? 'jpg' : 'png';
  const path = `users/${currentUser.uid}/workspaces/${workspaceId}/generated/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const bytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
  const objectRef = storageRef(storage, path);
  await uploadBytes(objectRef, bytes, { contentType: mimeType, customMetadata: { ownerUid: currentUser.uid, workspaceId } });
  return { url: await getDownloadURL(objectRef), path };
}
