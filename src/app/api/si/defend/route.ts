import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress, isHex } from "viem";
import { z } from "zod";
import { addresses, opsAbi, territoryAbi } from "@/lib/contracts";
import { decodeTokenId } from "@/lib/planets";
import { publicClient } from "@/server/chain";
import { store } from "@/server/store";
import { serverEnv } from "@/server/env";
import { attacksForDay, defensePower, resolveAttack } from "@/server/si/engine";
import { defenseMessage } from "@/lib/defense-message";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({
  attackId: z.string().regex(/^atk-\d{4}-\d{2}-\d{2}-\d+$/),
  tokenId: z.string().regex(/^\d{1,20}$/),
  wallet: z.string().refine(isAddress),
  issuedAt: z.string().datetime(),
  signature: z.string().refine((s) => isHex(s) && s.length >= 132),
});

const MAX_SKEW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`defend:${ip}`, 20, 60_000)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  if (!addresses) return NextResponse.json({ error: "Contracts not deployed on this network" }, { status: 503 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { attackId, tokenId, issuedAt, signature } = parsed.data;
  const wallet = getAddress(parsed.data.wallet);

  if (Math.abs(Date.now() - Date.parse(issuedAt)) > MAX_SKEW_MS) {
    return NextResponse.json({ error: "Signature expired — sign again" }, { status: 400 });
  }

  const day = attackId.slice(4, 14);
  const attack = attacksForDay(serverEnv.siSeed, day).find((a) => a.id === attackId);
  if (!attack) return NextResponse.json({ error: "Unknown attack" }, { status: 404 });
  const state = resolveAttack(attack, [], {});
  if (state.status !== "active") return NextResponse.json({ error: `Attack is ${state.status}` }, { status: 409 });

  const id = BigInt(tokenId);
  if (decodeTokenId(id).bodyId !== attack.bodyId) {
    return NextResponse.json({ error: "Territory is not on the attacked world" }, { status: 400 });
  }

  const message = defenseMessage({ attackId, tokenId, wallet, issuedAt });
  // verifyMessage supports EOAs and smart-contract wallets (ERC-1271 / ERC-6492).
  const valid = await publicClient.verifyMessage({ address: wallet, message, signature: signature as `0x${string}` });
  if (!valid) return NextResponse.json({ error: "Bad signature" }, { status: 401 });

  const [owner, stats] = await Promise.all([
    publicClient.readContract({ address: addresses.territory, abi: territoryAbi, functionName: "ownerOf", args: [id] }),
    publicClient.readContract({ address: addresses.ops, abi: opsAbi, functionName: "stats", args: [id] }),
  ]).catch(() => [null, null] as const);
  if (!owner || getAddress(owner) !== wallet) {
    return NextResponse.json({ error: "Wallet does not hold this territory" }, { status: 403 });
  }

  const [level, shield] = stats as readonly [number, number, bigint];
  const power = defensePower(Number(level), Number(shield));
  const added = await store.addDefense({
    attackId,
    tokenId,
    wallet: wallet.toLowerCase(),
    power,
    signature,
    createdAt: new Date().toISOString(),
  });
  if (!added) return NextResponse.json({ error: "This territory already defended this attack" }, { status: 409 });
  return NextResponse.json({ ok: true, power });
}
