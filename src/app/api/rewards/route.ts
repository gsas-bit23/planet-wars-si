import { NextResponse, type NextRequest } from "next/server";
import { isAddress } from "viem";
import { rewardsStore } from "@/server/rewards/store";
import { rewardsEnv } from "@/server/rewards/config";
import { entrantsFor } from "@/server/rewards/engine";
import { getChainSnapshot } from "@/server/indexer";
import { ACTIVITY, HOLD_SECONDS, ZONE_WEIGHT, utcDay } from "@/server/rewards/scoring";

export const dynamic = "force-dynamic";

/** Published epochs, lottery rounds (entrant lists elided) and the scoring config. */
export async function GET(req: NextRequest) {
  const who = (req.nextUrl.searchParams.get("address") ?? "").toLowerCase();
  try {
    const snap = await getChainSnapshot().catch(() => null);
    const today = utcDay(Math.max(Date.now() / 1000, snap?.latestTimestamp ?? 0));
    const [epochs, rounds, entrantsToday] = await Promise.all([
      rewardsStore.listEpochs(undefined, 60),
      rewardsStore.listRounds(30),
      entrantsFor(today, snap ?? undefined).catch((): string[] => []),
    ]);
    return NextResponse.json(
      {
        store: rewardsStore.kind,
        epochs,
        rounds: rounds.map(({ entrants, winners, ...r }) => ({ ...r, entrantCount: entrants.length, winnerCount: winners.length })),
        today: { entrants: entrantsToday.length, entered: isAddress(who) ? entrantsToday.includes(who) : null },
        config: {
          lotteryActivityDays: rewardsEnv.activityDays,
          lotteryWinners: 100,
          holdHours: HOLD_SECONDS / 3600,
          zoneWeights: ZONE_WEIGHT,
          activity: ACTIVITY,
        },
      },
      { headers: { "cache-control": who ? "no-store" : "public, s-maxage=20, stale-while-revalidate=60" } },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
