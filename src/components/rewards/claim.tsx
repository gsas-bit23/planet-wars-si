"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useReadContracts } from "wagmi";
import type { Abi } from "viem";
import { Gift, Trophy } from "lucide-react";
import { addresses, rewardPoolAbi } from "@/lib/contracts";
import { useTx } from "@/lib/hooks/use-tx";
import { formatPWSI } from "@/lib/format";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Empty } from "@/components/ui/empty";
import { WalletButton } from "@/components/layout/connect-button";
import type { ClaimView } from "./types";

const WINDOW_MS = 30 * 24 * 3600 * 1000;
const AIRDROP_BASE = 1_000_000_000n;

type AirdropResponse = {
  season: number;
  epochId: string;
  status: "published" | "preview";
  eligible: boolean;
  allocation?: { amount: string; proof: `0x${string}`[] } | null;
  preview?: { amount: string; activeDays: number; claimedPlot: boolean; faucet: boolean } | null;
  rules: { base: string; perActiveDay: string; maxActiveDays: number; plotBonus: string };
};

function useClaimed(account: `0x${string}` | undefined, epochIds: string[]) {
  return useReadContracts({
    allowFailure: false,
    contracts: account && addresses
      ? epochIds.map((id) => ({ address: addresses!.rewardPool, abi: rewardPoolAbi, functionName: "claimed" as const, args: [BigInt(id), account] as const }))
      : [],
    query: { enabled: !!account && epochIds.length > 0, refetchInterval: 20_000 },
  });
}

export function Claim() {
  const { address, isConnected } = useAccount();
  if (!isConnected || !address) {
    return (
      <section className="mx-auto max-w-[1400px] px-5 py-10 md:px-8">
        <Empty title="Connect to see your rewards" body="Leaderboard prizes, lottery wins and airdrops are claimed with Merkle proofs straight from the RewardPool contract." action={<WalletButton />} />
      </section>
    );
  }
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-10 md:px-8">
      <Tabs defaultValue="rewards" className="flex flex-col gap-6">
        <TabsList className="self-start">
          <TabsTrigger value="rewards">Daily rewards</TabsTrigger>
          <TabsTrigger value="airdrop">Airdrop</TabsTrigger>
        </TabsList>
        <TabsContent value="rewards"><RewardsTab account={address} /></TabsContent>
        <TabsContent value="airdrop"><AirdropTab account={address} /></TabsContent>
      </Tabs>
    </section>
  );
}

function RewardsTab({ account }: { account: `0x${string}` }) {
  const { send, pending } = useTx();
  const [now] = useState(() => Date.now());
  const { data, isLoading } = useQuery<{ claims: ClaimView[] }>({
    queryKey: ["claims", account],
    queryFn: () => fetch(`/api/claims?address=${account}`).then((r) => r.json()),
    refetchInterval: 30_000,
  });
  const claims = useMemo(() => (data?.claims ?? []).filter((c) => c.kind === "rewards"), [data]);
  const { data: claimedFlags } = useClaimed(account, claims.map((c) => c.epochId));
  const rows = claims.map((c, i) => {
    const claimed = (claimedFlags as boolean[] | undefined)?.[i] ?? false;
    const expired = c.publishedAt ? now > Date.parse(c.publishedAt) + WINDOW_MS : false;
    return { ...c, claimed, expired };
  });
  const open = rows.filter((r) => !r.claimed && !r.expired);
  const total = open.reduce((a, r) => a + BigInt(r.amount), 0n);

  async function claimAll() {
    if (!addresses || !open.length) return;
    await send(`Claim ${formatPWSI(total)} PWSI`, {
      address: addresses.rewardPool,
      abi: rewardPoolAbi as Abi,
      functionName: "claimMany",
      args: [open.map((r) => BigInt(r.epochId)), account, open.map((r) => BigInt(r.amount)), open.map((r) => r.proof)],
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <Panel hud className="p-7">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-mist"><Trophy className="size-4 text-solar" /> Claimable now</div>
        <div className="mt-3 font-display text-6xl font-bold tabular-nums tracking-[-0.04em] text-ion" data-testid="claimable-total">{formatPWSI(total)}</div>
        <div className="mt-1 font-mono text-sm text-mist">PWSI across {open.length} epoch{open.length === 1 ? "" : "s"}</div>
        <Button className="mt-8 w-full" size="lg" disabled={!open.length} loading={pending !== null} onClick={claimAll} data-testid="claim-rewards">
          {open.length ? "Claim all" : "Nothing to claim"}
        </Button>
        <p className="mt-4 text-xs leading-relaxed text-mist">Each epoch can be claimed for 30 days after publication. After that, unclaimed rewards return to the pool for future days.</p>
      </Panel>
      <Panel>
        <PanelHeader><h3 className="font-display text-lg font-bold tracking-tight">Your allocations</h3></PanelHeader>
        {isLoading ? (
          <p className="p-6 text-sm text-mist">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-mist">No rewards yet. Rank in the daily top 100 or win the daily lottery. Any qualifying action enters you automatically.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="claims-table">
              <thead className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-mist">
                <tr className="border-b border-line"><th className="px-5 py-3 text-left font-normal">Day</th><th className="px-5 py-3 text-right font-normal">Leaderboard</th><th className="px-5 py-3 text-right font-normal">Lottery</th><th className="px-5 py-3 text-right font-normal">Total</th><th className="px-5 py-3 text-right font-normal">Status</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.epochId} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-3 font-mono text-xs">{r.day}{r.rank ? <span className="ml-2 text-mist">#{r.rank}</span> : null}</td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums">{formatPWSI(BigInt(r.leaderboard))}</td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums">{formatPWSI(BigInt(r.lottery))}</td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-ion">{formatPWSI(BigInt(r.amount))}</td>
                    <td className="px-5 py-3 text-right"><Badge tone={r.claimed ? "ion" : r.expired ? "si" : "legend"}>{r.claimed ? "claimed" : r.expired ? "expired" : "claimable"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function AirdropTab({ account }: { account: `0x${string}` }) {
  const { send, pending } = useTx();
  const { data, isLoading } = useQuery<AirdropResponse>({
    queryKey: ["airdrop", account],
    queryFn: () => fetch(`/api/airdrop?address=${account}`).then((r) => r.json()),
  });
  const epochId = data ? BigInt(data.epochId) : AIRDROP_BASE + 1n;
  const { data: flags } = useClaimed(account, data?.status === "published" ? [epochId.toString()] : []);
  const claimed = (flags as boolean[] | undefined)?.[0] ?? false;
  const amount = data?.allocation?.amount ?? data?.preview?.amount;

  async function claim() {
    if (!addresses || !data?.allocation) return;
    await send(`Claim airdrop`, {
      address: addresses.rewardPool,
      abi: rewardPoolAbi as Abi,
      functionName: "claim",
      args: [epochId, account, BigInt(data.allocation.amount), data.allocation.proof],
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <Panel hud className="p-7" data-testid="airdrop-panel">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-mist"><Gift className="size-4 text-solar" /> Season {data?.season ?? 1} airdrop</div>
        {isLoading ? (
          <p className="mt-6 text-sm text-mist">Checking eligibility…</p>
        ) : data?.eligible ? (
          <>
            <div className="mt-3 font-display text-6xl font-bold tabular-nums tracking-[-0.04em] text-solar">{formatPWSI(amount ? BigInt(amount) : undefined)}</div>
            <div className="mt-1 font-mono text-sm text-mist">PWSI · {data.status === "published" ? "published on-chain" : "preview, snapshot not taken yet"}</div>
            {data.status === "published" ? (
              <Button className="mt-8 w-full" size="lg" disabled={claimed} loading={pending !== null} onClick={claim} data-testid="claim-airdrop">{claimed ? "Claimed" : "Claim airdrop"}</Button>
            ) : (
              <p className="mt-8 text-sm text-haze">You&apos;re eligible. The amount can still grow with more active days until the season snapshot is published.</p>
            )}
          </>
        ) : (
          <>
            <div className="mt-3 font-display text-4xl font-bold tracking-tight">Not eligible yet</div>
            <p className="mt-3 text-sm text-haze">{data?.status === "published" ? "This wallet was not in the season snapshot." : "Claim a plot, upgrade, launch a mission, trade, or use the faucet before the snapshot to qualify."}</p>
          </>
        )}
      </Panel>
      <Panel>
        <PanelHeader><h3 className="font-display text-lg font-bold tracking-tight">How the airdrop works</h3></PanelHeader>
        <div className="grid gap-3 p-5 text-sm leading-relaxed text-haze">
          <p>The airdrop comes from a separate allocation inside the RewardPool. It never touches revenue-funded daily rewards.</p>
          <ul className="grid gap-2 font-mono text-xs">
            <li className="flex justify-between border-b border-line/50 pb-2"><span className="text-mist">Base (any qualifying event or faucet use)</span><span>{data ? formatPWSI(BigInt(data.rules.base)) : "1,000"} PWSI</span></li>
            <li className="flex justify-between border-b border-line/50 pb-2"><span className="text-mist">Per active UTC day (max {data?.rules.maxActiveDays ?? 8})</span><span>+{data ? formatPWSI(BigInt(data.rules.perActiveDay)) : "250"} PWSI</span></li>
            <li className="flex justify-between"><span className="text-mist">Claimed at least one plot</span><span>+{data ? formatPWSI(BigInt(data.rules.plotBonus)) : "500"} PWSI</span></li>
          </ul>
          {data?.preview && (
            <p className="text-xs text-mist">Your activity: {data.preview.activeDays} active day(s){data.preview.claimedPlot ? " · claimed a plot" : ""}{data.preview.faucet ? " · faucet user" : ""}.</p>
          )}
          <p className="text-xs text-mist">Protocol wallets are excluded. If total eligibility exceeds the allocation, everyone is scaled down pro-rata. Unclaimed airdrop returns to the airdrop allocation after 30 days. Testnet tokens have no value.</p>
        </div>
      </Panel>
    </div>
  );
}
