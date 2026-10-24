import {
  collection, doc, getDocs, setDoc, updateDoc, deleteDoc, query, where, writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase.ts';
import { omitUndefinedDeep } from '../lib/firestoreSanitize.ts';
import { normalizeModelUsed } from '../lib/chatMessage.ts';
import {
  STATUSES, PLATFORMS, FORMATS, ASPECT_RATIOS,
  type ContentItemRecord, type ContentPayload, type ContentStatus, type AspectRatio,
} from '../lib/contentTypes.ts';
import { isValidDateString } from '../lib/contentPlanner.ts';

const COL = 'contentItems';

export function newContentId(prefix = 'cnt'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function browserTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; }
}

/** Builds a Firestore-safe record. Optional fields are omitted, never undefined. */
export function buildContentItem(input: {
  id?: string;
  userId: string;
  workspaceId: string;
  kind: 'studio' | 'calendar';
  content: ContentPayload;
  aspectRatio: AspectRatio;
  status?: ContentStatus;
  campaign?: string;
  planId?: string;
  pillar?: string;
  topic?: string;
  scheduledDate?: string;
  timezone?: string;
  modelUsed?: unknown;
  imageAssetUrl?: string;
  now?: string;
}): ContentItemRecord {
  const now = input.now || new Date().toISOString();
  const rec: ContentItemRecord = {
    id: input.id || newContentId(input.kind === 'calendar' ? 'cal' : 'cnt'),
    ownerId: input.userId,
    workspaceId: input.workspaceId,
    kind: input.kind,
    status: input.status || 'draft',
    content: input.content,
    aspectRatio: input.aspectRatio,
    createdAt: now,
    updatedAt: now,
  };
  const model = normalizeModelUsed(input.modelUsed);
  if (model) rec.modelUsed = model;
  if (input.imageAssetUrl) rec.imageAssetUrl = input.imageAssetUrl;
  if (input.campaign?.trim()) rec.campaign = input.campaign.trim();
  if (input.planId) rec.planId = input.planId;
  if (input.pillar) rec.pillar = input.pillar;
  if (input.topic) rec.topic = input.topic;
  if (input.scheduledDate && isValidDateString(input.scheduledDate)) rec.scheduledDate = input.scheduledDate;
  if (input.timezone) rec.timezone = input.timezone;
  return omitUndefinedDeep(rec);
}

/** Creates (or idempotently re-creates with the same id) a single item. */
export async function createContentItem(rec: ContentItemRecord): Promise<ContentItemRecord> {
  await setDoc(doc(db, COL, rec.id), omitUndefinedDeep(rec));
  return rec;
}

/** Saves a generated plan in small atomic batches. */
export async function createContentItems(recs: ContentItemRecord[]): Promise<void> {
  // Small batches: the security rules do a get() on the workspace for every create, and Firestore
  // caps rule document-access calls per request. Same ids on retry => no duplicates.
  for (let i = 0; i < recs.length; i += 10) {
    const batch = writeBatch(db);
    recs.slice(i, i + 10).forEach(r => batch.set(doc(db, COL, r.id), omitUndefinedDeep(r)));
    await batch.commit();
  }
}

/** Updates ONLY the given fields of ONE document. */
export async function updateContentItem(
  id: string,
  updates: Partial<Omit<ContentItemRecord, 'id' | 'ownerId' | 'workspaceId' | 'createdAt'>>
): Promise<void> {
  const clean = omitUndefinedDeep({ ...updates, updatedAt: new Date().toISOString() });
  await updateDoc(doc(db, COL, id), clean as Record<string, unknown>);
}

export async function deleteContentItem(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id)); // only ever called from an explicit user action
}

export async function duplicateContentItem(src: ContentItemRecord): Promise<ContentItemRecord> {
  const copy = buildContentItem({
    userId: src.ownerId,
    workspaceId: src.workspaceId,
    kind: src.kind,
    content: { ...src.content, title: `${src.content.title} (copy)` },
    aspectRatio: src.aspectRatio,
    status: 'draft', // a copy is never "published"/"approved"
    campaign: src.campaign,
    planId: src.planId,
    pillar: src.pillar,
    topic: src.topic,
    scheduledDate: src.scheduledDate,
    timezone: src.timezone,
    modelUsed: src.modelUsed,
  });
  return createContentItem(copy);
}

/** Tolerant read: skips malformed docs instead of crashing the UI. */
export function normalizeStoredContentItem(raw: unknown): ContentItemRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  if (typeof r.id !== 'string' || !r.content || typeof r.content !== 'object') return null;
  const c = r.content;
  if (!(PLATFORMS as readonly string[]).includes(c.platform) || !(FORMATS as readonly string[]).includes(c.format)) return null;
  const status: ContentStatus = (STATUSES as readonly string[]).includes(r.status) ? r.status : 'draft';
  const aspectRatio: AspectRatio = r.aspectRatio in ASPECT_RATIOS ? r.aspectRatio : '1:1';
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const content: ContentPayload = {
    ...c,
    title: str(c.title), objective: str(c.objective), audienceEstimate: str(c.audienceEstimate),
    creativeConcept: str(c.creativeConcept), hook: str(c.hook), caption: str(c.caption), cta: str(c.cta),
    hashtags: Array.isArray(c.hashtags) ? c.hashtags.filter((t: unknown) => typeof t === 'string') : [],
    visualDirection: str(c.visualDirection), textOverlay: str(c.textOverlay), imagePrompt: str(c.imagePrompt),
    assumptions: Array.isArray(c.assumptions) ? c.assumptions.filter((t: unknown) => typeof t === 'string') : [],
    creativeBrief: {
      composition: str(c.creativeBrief?.composition), colors: Array.isArray(c.creativeBrief?.colors) ? c.creativeBrief.colors : [],
      typography: str(c.creativeBrief?.typography), imagery: str(c.creativeBrief?.imagery),
      textOverlay: str(c.creativeBrief?.textOverlay), logoPlacement: str(c.creativeBrief?.logoPlacement),
    },
  };
  const out: ContentItemRecord = {
    id: r.id, ownerId: str(r.ownerId), workspaceId: str(r.workspaceId),
    kind: r.kind === 'calendar' ? 'calendar' : 'studio',
    status, content, aspectRatio,
    createdAt: str(r.createdAt) || new Date(0).toISOString(),
    updatedAt: str(r.updatedAt) || str(r.createdAt) || new Date(0).toISOString(),
  };
  const model = normalizeModelUsed(r.modelUsed);
  if (model) out.modelUsed = model;
  for (const k of ['campaign', 'planId', 'pillar', 'topic', 'timezone', 'publishedRecordedAt', 'imageAssetUrl'] as const) {
    if (typeof r[k] === 'string' && r[k]) (out as any)[k] = r[k];
  }
  if (isValidDateString(r.scheduledDate)) out.scheduledDate = r.scheduledDate;
  return out;
}

export async function fetchContentItems(workspaceId: string): Promise<ContentItemRecord[]> {
  const q = query(collection(db, COL), where('workspaceId', '==', workspaceId), where('ownerId', '==', auth.currentUser?.uid || ''));
  const snap = await getDocs(q); // let errors surface: the UI shows them instead of an empty library
  const list: ContentItemRecord[] = [];
  snap.forEach(d => {
    const item = normalizeStoredContentItem(d.data());
    if (item) list.push(item);
  });
  return list.sort((a, b) => (b.scheduledDate || b.updatedAt).localeCompare(a.scheduledDate || a.updatedAt));
}
