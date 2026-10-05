import { NextResponse } from "next/server";
import { getChainSnapshot } from "@/server/indexer";

export const dynamic = "force-dynamic";

/**
 * Revenue events indexed from RevenueTreasury.RevenueProcessed: every PWSI of game revenue with
 * its burned (10% default) and pooled (90% → RewardPool) parts, by source.
 */
export async function GET() {
  try {
    const snap = await getChainSnapshot();
    return NextResponse.json(
      { latestBlock: snap.latest, indexedAt: new Date(snap.at).toISOString(), events: snap.revenue.slice(-1000) },
      { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=60" } },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, events: [] }, { status: 502 });
  }
}
