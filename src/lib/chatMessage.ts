import { omitUndefinedDeep } from './firestoreSanitize.ts';

export type ChatRole = 'user' | 'assistant';

/** Persisted shape of a document in `chatMessages`. */
export interface ChatMessageRecord {
  id: string;
  ownerId: string;
  workspaceId: string;
  role: ChatRole;
  content: string;
  /** Present ONLY when a real model produced the message. Never a placeholder. */
  modelUsed?: string;
  suggestedActions?: string[];
  createdAt: string;
}

export interface ChatMessageInput {
  /** Caller supplied id. Re-using it on retry makes the write idempotent. */
  id?: string;
  userId: string;
  workspaceId: string;
  role: ChatRole;
  content: string;
  modelUsed?: unknown;
  suggestedActions?: unknown;
  createdAt?: string;
}

/**
 * Values that look like a model id but are not one. They are never stored and
 * never displayed as attribution.
 */
const NON_MODEL_VALUES = new Set(['', 'undefined', 'null', 'nan', 'offline-fallback', 'fallback-rules']);

export function normalizeModelUsed(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (NON_MODEL_VALUES.has(trimmed.toLowerCase())) return undefined;
  return trimmed;
}

function normalizeActions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const clean = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return clean.length > 0 ? clean : undefined;
}

export function newChatMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Builds a Firestore-safe message. Optional fields are OMITTED when absent,
 * never written as undefined / '' / 'undefined'.
 */
export function buildChatMessageRecord(input: ChatMessageInput): ChatMessageRecord {
  const record: ChatMessageRecord = {
    id: input.id || newChatMessageId(),
    ownerId: input.userId,
    workspaceId: input.workspaceId,
    role: input.role,
    content: input.content,
    createdAt: input.createdAt || new Date().toISOString(),
  };
  const modelUsed = input.role === 'assistant' ? normalizeModelUsed(input.modelUsed) : undefined;
  if (modelUsed) record.modelUsed = modelUsed;
  const actions = normalizeActions(input.suggestedActions);
  if (actions) record.suggestedActions = actions;
  // Extra safeguard; a no-op when the record was built correctly above.
  return omitUndefinedDeep(record);
}

export type WriteDoc = (collection: string, id: string, data: ChatMessageRecord) => Promise<void>;

/** Persists through an injected writer so the logic is testable without Firebase. */
export async function persistChatMessage(
  write: WriteDoc,
  input: ChatMessageInput
): Promise<ChatMessageRecord> {
  const record = buildChatMessageRecord(input);
  await write('chatMessages', record.id, record);
  return record;
}

/** Tolerant read: older documents may lack optional fields or hold junk. */
export function normalizeStoredChatMessage(raw: unknown): ChatMessageRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.content !== 'string') return null;
  if (r.role !== 'user' && r.role !== 'assistant') return null;
  const modelUsed = normalizeModelUsed(r.modelUsed);
  const actions = normalizeActions(r.suggestedActions);
  const out: ChatMessageRecord = {
    id: r.id,
    ownerId: typeof r.ownerId === 'string' ? r.ownerId : '',
    workspaceId: typeof r.workspaceId === 'string' ? r.workspaceId : '',
    role: r.role,
    content: r.content,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date(0).toISOString(),
  };
  if (modelUsed) out.modelUsed = modelUsed;
  if (actions) out.suggestedActions = actions;
  return out;
}
