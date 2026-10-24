import type { NextFunction, Request, Response } from 'express';

/**
 * Dependency-free auth logic. Kept separate from authMiddleware.ts (which imports firebase-admin)
 * so the security behaviour can be unit tested without Firebase credentials or network access.
 */

declare global {
  namespace Express {
    interface Request { firebaseUser?: { uid: string; email?: string }; }
  }
}

export function createFirebaseAuthMiddleware(
  verifyIdToken: (token: string, checkRevoked: boolean) => Promise<{ uid: string; email?: string }>
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.header('authorization') || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) return res.status(401).json({ error: 'Authentication required.', code: 'missing_token', retryable: false });
    try {
      const decoded = await verifyIdToken(match[1].trim(), true);
      if (!decoded || typeof decoded.uid !== 'string' || !decoded.uid) {
        return res.status(401).json({ error: 'Invalid or expired authentication token.', code: 'invalid_token', retryable: false });
      }
      req.firebaseUser = { uid: decoded.uid, ...(decoded.email ? { email: decoded.email } : {}) };
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired authentication token.', code: 'invalid_token', retryable: false });
    }
  };
}

/**
 * Cheap pre-filter mounted BEFORE the JSON body parser so anonymous clients cannot make the server
 * buffer and parse large request bodies. It only checks that a Bearer credential is present; real
 * verification (signature, expiry, revocation) still happens in requireFirebaseAuth inside the router.
 * Mounted at '/api', so `req.path` is relative to that mount.
 */
export function rejectAnonymousBeforeBodyParsing(req: Request, res: Response, next: NextFunction) {
  if (req.path === '/health') return next();
  if (!/^Bearer\s+\S+/i.test(req.header('authorization') || '')) {
    return res.status(401).json({ error: 'Authentication required.', code: 'missing_token', retryable: false });
  }
  return next();
}

/**
 * Collects every place the client may have put a workspace id. They ALL must be present-or-absent
 * consistently: if two locations name different workspaces the request is ambiguous and rejected,
 * so an attacker cannot pass the ownership check with one id while the handler uses another.
 */
export function extractWorkspaceIds(body: any): { ids: string[]; malformed: boolean } {
  const candidates = [
    body?.workspaceId,
    body?.context?.workspaceId,
    body?.context?.workspace?.id,
    body?.request?.context?.workspaceId,
    body?.input?.context?.workspaceId,
    body?.workspaceContext?.workspaceId,
  ];
  const ids: string[] = [];
  let malformed = false;
  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    if (typeof c !== 'string' || !c.trim()) { malformed = true; continue; }
    ids.push(c);
  }
  return { ids, malformed };
}

/** Workspace IDs are accepted only as selectors. Ownership is always checked against Admin Firestore. */
export function createWorkspaceOwnershipMiddleware(
  loadWorkspaceOwner: (workspaceId: string) => Promise<string | null>
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { ids, malformed } = extractWorkspaceIds(req.body || {});
    if (ids.length === 0) {
      return res.status(400).json({ error: 'workspaceId is required for this operation.', code: 'workspace_required', retryable: false });
    }
    if (malformed || new Set(ids).size !== 1) {
      return res.status(400).json({ error: 'Ambiguous or invalid workspaceId.', code: 'workspace_ambiguous', retryable: false });
    }
    const workspaceId = ids[0];
    // Firestore document ids cannot contain '/', and we never want path traversal into other collections.
    if (workspaceId.length > 128 || !/^[A-Za-z0-9_-]+$/.test(workspaceId)) {
      return res.status(400).json({ error: 'Ambiguous or invalid workspaceId.', code: 'workspace_ambiguous', retryable: false });
    }
    try {
      const ownerId = await loadWorkspaceOwner(workspaceId);
      if (!ownerId || ownerId !== req.firebaseUser?.uid) {
        return res.status(403).json({ error: 'You do not have access to this workspace.', code: 'workspace_forbidden', retryable: false });
      }
      return next();
    } catch (err) {
      console.error('[Auth] Workspace ownership check failed:', err);
      return res.status(503).json({ error: 'Workspace authorization is temporarily unavailable.', code: 'authorization_unavailable', retryable: true });
    }
  };
}
