import { NextResponse } from "next/server";
import { getChainSnapshot } from "@/server/indexer";

export const dynamic = "force-dynamic";

/** Burn events indexed from on-chain Transfer(to = 0x0) logs since the deploy block. */
export async function GET() {
  try {
    const snap = await getChainSnapshot();
    return NextResponse.json(
      { latestBlock: snap.latest, indexedAt: new Date(snap.at).toISOString(), burns: snap.burns.slice(-1000) },
      { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=60" } },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, burns: [] }, { status: 502 });
  }
}
