import "server-only";
import type { Attack, Broadcast, Defense } from "../si/types";
import type { GameStore } from "./types";

type Mem = { defenses: (Defense & { signature: string })[]; broadcasts: Map<string, Broadcast>; attacks: Map<string, Attack> };
const g = globalThis as unknown as { __pwsiMem?: Mem };
const mem: Mem = (g.__pwsiMem ??= { defenses: [], broadcasts: new Map(), attacks: new Map() });

/**
 * Process-local store for development and DB-less previews. SI events are deterministic so
 * nothing is lost on restart except defenses. Use Supabase in production.
 */
export const memoryStore: GameStore = {
  kind: "memory",
  async listDefenses(ids) {
    const set = new Set(ids);
    return mem.defenses.filter((d) => set.has(d.attackId));
  },
  async listDefensesSince(sinceIso) {
    const t = Date.parse(sinceIso);
    return mem.defenses.filter((d) => Date.parse(d.createdAt) >= t);
  },
  async addDefense(d) {
    if (mem.defenses.some((x) => x.attackId === d.attackId && x.tokenId === d.tokenId)) return false;
    mem.defenses.push(d);
    return true;
  },
  async getBroadcasts(days) {
    const out = new Map<string, Broadcast>();
    for (const d of days) {
      const b = mem.broadcasts.get(d);
      if (b) out.set(d, b);
    }
    return out;
  },
  async upsertBroadcast(b) {
    mem.broadcasts.set(b.day, b);
  },
  async upsertAttacks(list) {
    for (const a of list) mem.attacks.set(a.id, a);
  },
};
