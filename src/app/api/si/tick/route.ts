import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/server/env";
import { store } from "@/server/store";
import { attacksForDay, broadcastForDay, dayKey } from "@/server/si/engine";
import { llmBroadcast } from "@/server/si/llm";
import { runRewardsTick } from "@/server/rewards/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily SI tick (Vercel Cron → GET with `Authorization: Bearer $CRON_SECRET`).
 * Persists today's attacks and broadcast (optionally LLM-written), then runs the rewards engine
 * (lottery commit/close/reveal + daily epoch publication). Idempotent.
 */
async function tick(req: NextRequest) {
  if (!serverEnv.cronSecret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${serverEnv.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const day = dayKey();
  const attacks = attacksForDay(serverEnv.siSeed, day);
  const existing = await store.getBroadcasts([day]);
  let broadcast = existing.get(day);
  if (!broadcast) {
    broadcast = await llmBroadcast(broadcastForDay(serverEnv.siSeed, day), attacks);
    await store.upsertBroadcast(broadcast);
  }
  await store.upsertAttacks(attacks);
  const rewards = req.nextUrl.searchParams.get("rewards") === "0" ? null : await runRewardsTick();
  return NextResponse.json({ ok: true, day, store: store.kind, broadcast: broadcast.title, attacks: attacks.length, rewards });
}

export const GET = tick;
export const POST = tick;
