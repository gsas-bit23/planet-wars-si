import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertStoreChain } from "./chain-guard";
import { serverEnv } from "../env";
import type { Broadcast, Defense } from "../si/types";
import type { GameStore } from "./types";

let client: SupabaseClient | null = null;
function db() {
  client ??= createClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

async function cdb() {
  const c = db();
  await assertStoreChain(c);
  return c;
}

/** Postgres-backed store (schema: supabase/migrations). Uses the service-role key server-side only. */
export const supabaseStore: GameStore = {
  kind: "supabase",
  async listDefenses(ids) {
    if (!ids.length) return [];
    const { data, error } = await (await cdb())
      .from("si_defenses")
      .select("attack_id, wallet, token_id, power, created_at")
      .in("attack_id", ids);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      attackId: r.attack_id,
      wallet: r.wallet,
      tokenId: String(r.token_id),
      power: r.power,
      createdAt: r.created_at,
    }));
  },
  async listDefensesSince(sinceIso) {
    const { data, error } = await (await cdb())
      .from("si_defenses")
      .select("attack_id, wallet, token_id, power, created_at")
      .gte("created_at", sinceIso)
      .order("created_at")
      .limit(50_000);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      attackId: r.attack_id,
      wallet: r.wallet,
      tokenId: String(r.token_id),
      power: r.power,
      createdAt: r.created_at,
    }));
  },
  async addDefense(d: Defense & { signature: string }) {
    const { error } = await (await cdb()).from("si_defenses").insert({
      attack_id: d.attackId,
      wallet: d.wallet.toLowerCase(),
      token_id: d.tokenId,
      power: d.power,
      signature: d.signature,
    });
    if (error?.code === "23505") return false; // unique (attack_id, token_id)
    if (error) throw error;
    return true;
  },
  async getBroadcasts(days) {
    const out = new Map<string, Broadcast>();
    if (!days.length) return out;
    const { data, error } = await (await cdb()).from("si_broadcasts").select("*").in("day", days);
    if (error) throw error;
    for (const r of data ?? []) {
      out.set(r.day, {
        id: `bc-${r.day}`,
        day: r.day,
        title: r.title,
        body: r.body,
        threatLevel: r.threat_level,
        focusBodyId: r.focus_body_id,
        source: r.source,
        createdAt: r.created_at,
      });
    }
    return out;
  },
  async upsertBroadcast(b) {
    const { error } = await (await cdb()).from("si_broadcasts").upsert(
      {
        day: b.day,
        title: b.title,
        body: b.body,
        threat_level: b.threatLevel,
        focus_body_id: b.focusBodyId,
        source: b.source,
      },
      { onConflict: "day" },
    );
    if (error) throw error;
  },
  async upsertAttacks(list) {
    const { error } = await (await cdb())
      .from("si_attacks")
      .upsert(
        list.map((a) => ({
          id: a.id,
          day: a.day,
          body_id: a.bodyId,
          sector: a.sector,
          kind: a.kind,
          severity: a.severity,
          starts_at: a.startsAt,
          ends_at: a.endsAt,
        })),
        { onConflict: "id" },
      );
    if (error) throw error;
  },
};
