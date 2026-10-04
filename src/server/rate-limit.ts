import "server-only";

const g = globalThis as unknown as { __pwsiRl?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.__pwsiRl ??= new Map<string, number[]>());

/** Sliding-window limiter (per instance). Good enough for abuse dampening on API routes. */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  return true;
}
