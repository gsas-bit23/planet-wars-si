import { NextResponse, type NextRequest } from "next/server";
import { isAddress } from "viem";
import { addresses } from "@/lib/contracts";
import { rewardsStore } from "@/server/rewards/store";
import { AIRDROP_EPOCH_BASE, AIRDROP_RULES, airdropEligibility, excludedAccounts } from "@/server/rewards/engine";
import { getChainSnapshot } from "@/server/indexer";

export const dynamic = "force-dynamic";
const SEASON = 1;

/** Airdrop eligibility: the published allocation if the season is live, otherwise a live preview. */
export async function GET(req: NextRequest) {
  const address = (req.nextUrl.searchParams.get("address") ?? "").toLowerCase();
  if (!isAddress(address)) return NextResponse.json({ error: "bad address" }, { status: 400 });
  const epochId = (AIRDROP_EPOCH_BASE + BigInt(SEASON)).toString();
  try {
    const epoch = await rewardsStore.getEpoch(epochId);
    const rules = {
      base: AIRDROP_RULES.base.toString(),
      perActiveDay: AIRDROP_RULES.perActiveDay.toString(),
      maxActiveDays: AIRDROP_RULES.maxActiveDays,
      plotBonus: AIRDROP_RULES.plotBonus.toString(),
    };
    if (epoch?.status === "published") {
      const alloc = (await rewardsStore.allocationsOf(epochId)).find((a) => a.account === address) ?? null;
      return NextResponse.json({ season: SEASON, epochId, status: "published", epoch, eligible: !!alloc, allocation: alloc, rules });
    }
    const snap = await getChainSnapshot();
    const excluded = excludedAccounts();
    if (addresses) excluded.add(addresses.operator.toLowerCase());
    const e = airdropEligibility(snap, excluded).find((x) => x.account === address);
    return NextResponse.json({
      season: SEASON,
      epochId,
      status: "preview",
      eligible: !!e,
      preview: e ? { ...e, amount: e.amount.toString() } : null,
      rules,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
