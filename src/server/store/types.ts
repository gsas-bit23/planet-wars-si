import type { Attack, Broadcast, Defense } from "../si/types";

export interface GameStore {
  readonly kind: "supabase" | "memory";
  listDefenses(attackIds: string[]): Promise<Defense[]>;
  /** All defenses created at or after `sinceIso` (rewards: activity + lottery eligibility). */
  listDefensesSince(sinceIso: string): Promise<Defense[]>;
  /** Returns false when this territory already defended this attack. */
  addDefense(d: Defense & { signature: string }): Promise<boolean>;
  /** Persisted (possibly LLM-written) broadcasts keyed by day. */
  getBroadcasts(days: string[]): Promise<Map<string, Broadcast>>;
  upsertBroadcast(b: Broadcast): Promise<void>;
  upsertAttacks(a: Attack[]): Promise<void>;
}
