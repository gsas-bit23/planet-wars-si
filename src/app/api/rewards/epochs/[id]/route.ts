import { NextResponse, type NextRequest } from "next/server";
import { rewardsStore } from "@/server/rewards/store";

export const dynamic = "force-dynamic";

/** Full epoch data (the URI emitted on-chain): every allocation with its Merkle proof. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/rewards/epochs/[id]">) {
  const { id } = await ctx.params;
  if (!/^\d{1,12}$/.test(id)) return NextResponse.json({ error: "bad epoch id" }, { status: 400 });
  const epoch = await rewardsStore.getEpoch(id);
  if (!epoch) return NextResponse.json({ error: "unknown epoch" }, { status: 404 });
  const allocations = await rewardsStore.allocationsOf(id);
  return NextResponse.json(
    { epoch, leafEncoding: "keccak256(bytes.concat(keccak256(abi.encode(uint256 epochId, address account, uint256 amount))))", allocations },
    { headers: { "cache-control": "public, s-maxage=60" } },
  );
}
