import "server-only";
import { serverEnv } from "../env";
import { store } from "../store";
import { getChainSnapshot, tallyMissions } from "../indexer";
import { attacksForDay, broadcastForDay, daysBack, planetControl, resolveAttack } from "./engine";
import type { AttackView, Broadcast, PlanetControl } from "./types";

export type Feed = {
  generatedAt: string;
  store: "supabase" | "memory";
  broadcasts: Broadcast[];
  attacks: AttackView[];
  control: PlanetControl[];
};

const HISTORY_DAYS = 14;

/** Assemble the SI feed: deterministic events + persisted text overrides + defenses + missions. */
export async function buildFeed(now = new Date()): Promise<Feed> {
  const days = daysBack(HISTORY_DAYS, now);
  const attacks = days.flatMap((d) => attacksForDay(serverEnv.siSeed, d));

  const [persisted, defenses, snapshot] = await Promise.all([
    store.getBroadcasts(days).catch(() => new Map<string, Broadcast>()),
    store.listDefenses(attacks.map((a) => a.id)).catch(() => []),
    getChainSnapshot().catch(() => ({ missions: [] as { bodyId: number; missionType: number; player: string; block: number }[] })),
  ]);

  const missions = tallyMissions(snapshot.missions);
  const views = attacks
    .map((a) => resolveAttack(a, defenses, missions, now.getTime()))
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  const broadcasts = days.map((d) => persisted.get(d) ?? broadcastForDay(serverEnv.siSeed, d));

  return {
    generatedAt: now.toISOString(),
    store: store.kind,
    broadcasts,
    attacks: views,
    control: planetControl(views, missions, now.getTime()),
  };
}
