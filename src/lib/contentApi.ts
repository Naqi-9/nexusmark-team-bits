import { authenticatedFetch } from './firebase.ts';
import type { ContentPayload, RegenerableField } from './contentTypes.ts';

export class ApiError extends Error {
  code: string; retryable: boolean;
  constructor(message: string, code = 'generation_failed', retryable = true) { super(message); this.code = code; this.retryable = retryable; }
}

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await authenticatedFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ApiError('Could not reach the server. Check your connection and retry.', 'network', true);
  }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error || 'Request failed. Please retry.', json.code, json.retryable !== false);
  return json as T;
}

export interface GenerateParams {
  platform: string; format: string; objective: string; topic: string; audience: string; tone: string;
  language: string; cta: string; variations: number; customRequest: string;
}

export const contentApi = {
  capabilities: async () => {
    const res = await authenticatedFetch('/api/content/capabilities');
    if (!res.ok) throw new ApiError('Could not load capabilities.');
    return (await res.json()) as { textModel: string; textConfigured: boolean; image: { configured: boolean; model: string | null; paidOnly?: boolean } };
  },
  generate: (context: unknown, request: GenerateParams) =>
    post<{ variations: ContentPayload[]; warnings: string[][]; modelUsed: string }>('/api/content/generate', { context, request }),
  regenerateSection: (context: unknown, input: { field: RegenerableField; instruction: string; content: ContentPayload }) =>
    post<{ field: RegenerableField; value: unknown; warnings: string[]; modelUsed: string }>('/api/content/regenerate-section', { context, input }),
  calendar: (context: unknown, request: unknown) =>
    post<{ entries: { slot: { index: number; date: string; platform: string; format: string; pillar: string }; topic: string; content: ContentPayload; warnings: string[]; modelUsed: string }[]; failedSlots: { index: number; date: string; platform: string }[]; requestedSlots: number }>('/api/content/calendar', { context, request }),
  regenerateEntry: (context: unknown, input: unknown) =>
    post<{ slot: unknown; topic: string; content: ContentPayload; warnings: string[]; modelUsed: string }>('/api/content/regenerate-entry', { context, input }),
  image: (prompt: string, aspectRatio: string, workspaceId: string) =>
    post<{ imageBase64: string; mimeType: string; modelUsed: string }>('/api/content/image', { prompt, aspectRatio, workspaceId }),
};
