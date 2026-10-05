import { NextResponse, type NextRequest } from "next/server";
import { isAddress } from "viem";
import { rewardsStore } from "@/server/rewards/store";

export const dynamic = "force-dynamic";

/** Every published allocation for `address` with Merkle proofs (claimed status is read on-chain by the UI). */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address") ?? "";
  if (!isAddress(address)) return NextResponse.json({ error: "bad address" }, { status: 400 });
  try {
    const [allocs, epochs] = await Promise.all([rewardsStore.allocationsFor(address), rewardsStore.listEpochs(undefined, 500)]);
    const byId = new Map(epochs.map((e) => [e.epochId, e]));
    const claims = allocs
      .map((a) => ({ ...a, epoch: byId.get(a.epochId) }))
      .filter((a) => a.epoch?.status === "published")
      .map(({ epoch, ...a }) => ({ ...a, kind: epoch!.kind, day: epoch!.day, publishedAt: epoch!.publishedAt }))
      .sort((a, b) => (BigInt(b.epochId) > BigInt(a.epochId) ? 1 : -1));
    return NextResponse.json({ address: address.toLowerCase(), claims }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, claims: [] }, { status: 502 });
  }
}
