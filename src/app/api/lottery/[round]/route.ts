import { NextResponse, type NextRequest } from "next/server";
import { rewardsStore } from "@/server/rewards/store";
import { seedFor } from "@/server/rewards/engine";
import { dayLabel } from "@/server/rewards/scoring";

export const dynamic = "force-dynamic";

/**
 * Everything needed to re-verify a lottery round independently:
 *   keccak256(abi.encode(seed)) == seedHash (committed before the round started)
 *   keccak256(abi.encodePacked(entrants)) == entrantsHash (fixed by close())
 *   randomness == keccak256(abi.encode(seed, blockhash(targetBlock), round, entrantsHash))
 *   winners == entrants[DailyDraw.drawIndices(randomness, n, min(100, n))]
 * The seed is only disclosed once the round is revealed.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/lottery/[round]">) {
  const { round } = await ctx.params;
  if (!/^\d{1,7}$/.test(round)) return NextResponse.json({ error: "bad round" }, { status: 400 });
  const r = await rewardsStore.getRound(Number(round));
  if (!r) return NextResponse.json({ error: "unknown round", round: Number(round), day: dayLabel(Number(round)) }, { status: 404 });
  return NextResponse.json(
    { ...r, seed: r.status === "revealed" ? seedFor(r.round) : null },
    { headers: { "cache-control": "public, s-maxage=30" } },
  );
}
