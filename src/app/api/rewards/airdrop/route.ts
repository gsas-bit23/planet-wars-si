import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/server/env";
import { publishAirdrop } from "@/server/rewards/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Operator-only: snapshot and publish an airdrop season (Authorization: Bearer $CRON_SECRET). */
export async function POST(req: NextRequest) {
  if (!serverEnv.cronSecret || req.headers.get("authorization") !== `Bearer ${serverEnv.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const season = Number(req.nextUrl.searchParams.get("season") || 1);
  if (!Number.isInteger(season) || season < 1 || season > 100) return NextResponse.json({ error: "bad season" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await publishAirdrop(season)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message.split("\n").slice(0, 3).join(" ") }, { status: 500 });
  }
}
