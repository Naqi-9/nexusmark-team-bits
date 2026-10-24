/**
 * Firestore payload helpers.
 *
 * Firestore rejects `undefined` anywhere in a document (top level, nested
 * objects, array items). These helpers remove it WITHOUT touching Firestore
 * specific values (serverTimestamp() sentinels, Timestamp, GeoPoint,
 * DocumentReference, Date, Uint8Array...). Only plain objects and arrays are
 * walked; every other value is returned by reference, untouched.
 *
 * This is a safety net. Payloads should still be built correctly at the source
 * (see chatMessage.ts); we do not enable `ignoreUndefinedProperties` globally.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function omitUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    // Firestore also rejects undefined array items; drop them.
    return value
      .filter(item => item !== undefined)
      .map(item => omitUndefinedDeep(item)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (val === undefined) continue;
      out[key] = omitUndefinedDeep(val);
    }
    return out as T;
  }
  // primitives, null, Date, Firestore sentinels / Timestamps / refs: unchanged
  return value;
}

/** Returns the dotted paths of every `undefined` Firestore would reject. */
export function findUndefinedPaths(value: unknown, path = ''): string[] {
  if (value === undefined) return [path || '(root)'];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => findUndefinedPaths(item, `${path}[${i}]`));
  }
  if (isPlainObject(value)) {
    return Object.entries(value).flatMap(([k, v]) =>
      findUndefinedPaths(v, path ? `${path}.${k}` : k)
    );
  }
  return [];
}
