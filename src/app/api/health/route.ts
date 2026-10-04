import { NextResponse } from "next/server";
import { targetChain } from "@/lib/chains";
import { addresses } from "@/lib/contracts";
import { store } from "@/server/store";
import { publicClient } from "@/server/chain";

export const dynamic = "force-dynamic";

export async function GET() {
  const block = await publicClient.getBlockNumber().catch(() => null);
  return NextResponse.json({
    ok: block !== null,
    chain: { id: targetChain.id, name: targetChain.name, block: block?.toString() ?? null },
    contractsDeployed: addresses !== null,
    store: store.kind,
  });
}
