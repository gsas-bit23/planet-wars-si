import { NextResponse, type NextRequest } from "next/server";
import { leaderboardFor } from "@/server/rewards/engine";
import { rewardsStore } from "@/server/rewards/store";
import { dayFromLabel, dayLabel, tierBps, utcDay } from "@/server/rewards/scoring";
import { getChainSnapshot } from "@/server/indexer";

export const dynamic = "force-dynamic";

/** Daily leaderboard. Past published days come from the store; today is a live, provisional view. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("day");
  // Chain time (equals wall time on live networks; lets local forks time-travel).
  const snap = await getChainSnapshot().catch(() => null);
  const today = utcDay(Math.max(Date.now() / 1000, snap?.latestTimestamp ?? 0));
  const day = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? dayFromLabel(q) : today;
  if (day > today) return NextResponse.json({ error: "future day" }, { status: 400 });
  try {
    const stored = day < today ? await rewardsStore.getScores(dayLabel(day)) : [];
    const epoch = day < today ? await rewardsStore.getEpoch(String(day)) : null;
    const rows = stored.length
      ? stored.map((r) => ({ account: r.account, rank: r.rank, score: r.score, breakdown: r.breakdown }))
      : (await leaderboardFor(day, snap ?? undefined)).map((r) => ({ account: r.account, rank: r.rank, score: r.score, breakdown: r.breakdown }));
    return NextResponse.json(
      {
        day: dayLabel(day),
        today: dayLabel(today),
        provisional: !epoch || epoch.status !== "published",
        epoch,
        rows: rows.map((r) => ({ ...r, tierBps: tierBps(r.rank) })),
      },
      { headers: { "cache-control": "public, s-maxage=20, stale-while-revalidate=60" } },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, rows: [] }, { status: 502 });
  }
}
