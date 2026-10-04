import { NextResponse } from "next/server";
import { buildFeed } from "@/server/si/feed";

export const dynamic = "force-dynamic";

export async function GET() {
  const feed = await buildFeed();
  return NextResponse.json(feed, { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=60" } });
}
