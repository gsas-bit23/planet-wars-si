import { NextResponse } from "next/server";
import { targetChain } from "@/lib/chains";
import { addresses, hasFaucet } from "@/lib/contracts";
import { store } from "@/server/store";
import { publicClient } from "@/server/chain";

export const dynamic = "force-dynamic";

export async function GET() {
  const [block, rpcChainId] = await Promise.all([
    publicClient.getBlockNumber().catch(() => null),
    publicClient.getChainId().catch(() => null),
  ]);
  // A server RPC_URL pointing at another network than NEXT_PUBLIC_CHAIN_ID is a misconfiguration.
  const rpcMatches = rpcChainId === targetChain.id;
  return NextResponse.json({
    ok: block !== null && rpcMatches,
    chain: { id: targetChain.id, name: targetChain.name, block: block?.toString() ?? null, rpcChainId, rpcMatches },
    contractsDeployed: addresses !== null,
    faucet: hasFaucet,
    store: store.kind,
  });
}
