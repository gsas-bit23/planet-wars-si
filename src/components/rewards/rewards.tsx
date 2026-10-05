"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { Dice5, ExternalLink, ShieldCheck, Sparkles } from "lucide-react";
import { useProtocolStats } from "@/lib/hooks/use-game";
import { addresses } from "@/lib/contracts";
import { explorerAddress, explorerTx } from "@/lib/chains";
import { formatPWSI } from "@/lib/format";
import { shortAddress } from "@/lib/utils";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/stat";
import type { RewardsResponse } from "./types";

const STATUS_TONE = { committed: "neutral", closed: "legend", revealed: "ion", voided: "si", skipped: "neutral" } as const;

export function Rewards() {
  const { address } = useAccount();
  const { data: s } = useProtocolStats();
  const { data } = useQuery<RewardsResponse>({
    queryKey: ["rewards", address],
    queryFn: () => fetch(`/api/rewards${address ? `?address=${address}` : ""}`).then((r) => r.json()),
    refetchInterval: 30_000,
  });
  const lotteryPot = s ? (s.epochCap * 3000n) / 10000n : undefined;
  const days = data?.config.lotteryActivityDays ?? 7;
  const epochs = (data?.epochs ?? []).filter((e) => e.kind === "rewards");

  return (
    <section className="mx-auto flex max-w-[1400px] flex-col gap-6 px-5 py-10 md:px-8">
      <div className="grid gap-6 md:grid-cols-4">
        <Panel className="p-5"><Stat label="Reward pool (unallocated)" value={formatPWSI(s?.rewardsAvailable, { compact: true })} tone="ion" sub={`${formatPWSI(s?.outstanding, { compact: true })} allocated, awaiting claims`} /></Panel>
        <Panel className="p-5"><Stat label="Today's budget cap" value={formatPWSI(s?.epochCap, { compact: true })} sub="20% of unallocated rewards · 70% leaderboard / 30% lottery" /></Panel>
        <Panel className="p-5"><Stat label="Lottery pot (est.)" value={formatPWSI(lotteryPot, { compact: true })} tone="solar" sub={`split equally across up to ${data?.config.lotteryWinners ?? 100} winners`} /></Panel>
        <Panel className="p-5" data-testid="lottery-entry">
          <Stat
            label="Your lottery entry"
            value={data?.today.entered == null ? "—" : data.today.entered ? "Entered" : "Not yet"}
            tone={data?.today.entered ? "ion" : "default"}
            sub={`${data?.today.entrants ?? 0} wallets entered today`}
          />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel>
          <PanelHeader><div className="flex items-center gap-2"><Dice5 className="size-4 text-solar" /><h3 className="font-display text-lg font-bold tracking-tight">Daily lottery rounds</h3></div></PanelHeader>
          {(data?.rounds ?? []).length === 0 ? (
            <p className="p-6 text-sm text-mist">The first round is committed on-chain ahead of time; results appear here after the day ends.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="rounds-table">
                <thead className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-mist">
                  <tr className="border-b border-line"><th className="px-5 py-3 text-left font-normal">Day (UTC)</th><th className="px-5 py-3 text-left font-normal">Status</th><th className="px-5 py-3 text-right font-normal">Entrants</th><th className="px-5 py-3 text-right font-normal">Winners</th><th className="px-5 py-3 text-right font-normal">Verify</th></tr>
                </thead>
                <tbody>
                  {data!.rounds.map((r) => (
                    <tr key={r.round} className="border-b border-line/60 last:border-0">
                      <td className="px-5 py-3 font-mono text-xs">{r.day}</td>
                      <td className="px-5 py-3"><Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge></td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums">{r.status === "committed" ? "—" : r.entrantCount}</td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums">{r.status === "revealed" ? r.winnerCount : "—"}</td>
                      <td className="px-5 py-3 text-right">
                        <span className="inline-flex items-center gap-3 font-mono text-[11px]">
                          <a className="text-ion hover:underline" href={`/api/lottery/${r.round}`} target="_blank" rel="noreferrer">data</a>
                          {Object.entries(r.txs).map(([k, h]) => (
                            <a key={k} className="text-mist hover:text-ink" href={explorerTx(h)} target="_blank" rel="noreferrer">{k}</a>
                          ))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="grid content-start gap-6">
          <Panel tone="ion">
            <PanelHeader><div className="flex items-center gap-2"><Sparkles className="size-4 text-ion" /><h3 className="font-display text-lg font-bold tracking-tight">Who can win</h3></div></PanelHeader>
            <div className="grid gap-3 p-5 text-sm leading-relaxed text-haze">
              <p>Entry is free. Every wallet with at least one qualifying game event in the last {days} UTC days is entered automatically: claiming a plot, upgrading, building a shield, launching a mission, a marketplace trade, or defending against an SI attack.</p>
              <p>Up to 100 winners per day share the lottery pot equally. Protocol wallets are excluded. Every qualifying on-chain action costs PWSI (and defenses require holding a plot), which makes farming entries with throwaway wallets expensive.</p>
            </div>
          </Panel>
          <Panel>
            <PanelHeader><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-ok" /><h3 className="font-display text-lg font-bold tracking-tight">Verifiable draw</h3></div></PanelHeader>
            <ol className="grid gap-3 p-5 text-sm leading-relaxed text-haze">
              <li><span className="font-mono text-ion">1 ·</span> Before the day starts, the operator commits <code className="font-mono text-xs">keccak256(seed)</code> to the DailyDraw contract{addresses && <> (<a className="text-ion hover:underline" href={explorerAddress(addresses.dailyDraw)} target="_blank" rel="noreferrer">{shortAddress(addresses.dailyDraw)}</a>)</>}.</li>
              <li><span className="font-mono text-ion">2 ·</span> After the day ends, the entrant list is fixed on-chain (its hash) and a future L2 block, 10 blocks ahead, is chosen.</li>
              <li><span className="font-mono text-ion">3 ·</span> The seed is revealed; randomness = keccak256(seed, hash of that block, round, entrants). Winners = <code className="font-mono text-xs">drawIndices(randomness, n, 100)</code>, a view function anyone can call.</li>
              <li><span className="font-mono text-ion">4 ·</span> If a reveal is withheld past the 256-block window, anyone can void the round. It can never be redrawn.</li>
              <li className="text-xs text-mist">Limits: Chainlink VRF is not available on Robinhood Chain. This commit-reveal scheme stops the operator from choosing winners after seeing the block, but the operator could still decline to reveal (voiding that day&apos;s lottery). The pot then stays in the pool.</li>
            </ol>
          </Panel>
        </div>
      </div>

      <Panel>
        <PanelHeader><h3 className="font-display text-lg font-bold tracking-tight">Published epochs</h3><span className="font-mono text-xs text-mist">Merkle roots on RewardPool{addresses && <> · <a className="hover:text-ink" href={explorerAddress(addresses.rewardPool)} target="_blank" rel="noreferrer">{shortAddress(addresses.rewardPool)}</a></>}</span></PanelHeader>
        {epochs.length === 0 ? (
          <p className="p-6 text-sm text-mist">No epochs yet. The first daily epoch is published shortly after 00:00 UTC.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-mist">
                <tr className="border-b border-line"><th className="px-5 py-3 text-left font-normal">Day</th><th className="px-5 py-3 text-left font-normal">Status</th><th className="px-5 py-3 text-right font-normal">Leaderboard</th><th className="px-5 py-3 text-right font-normal">Lottery</th><th className="px-5 py-3 text-right font-normal">Recipients</th><th className="px-5 py-3" /></tr>
              </thead>
              <tbody>
                {epochs.map((e) => (
                  <tr key={e.epochId} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-3 font-mono text-xs">{e.day}</td>
                    <td className="px-5 py-3"><Badge tone={e.status === "published" ? "ion" : "neutral"}>{e.status}</Badge></td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums">{formatPWSI(BigInt(e.leaderboardTotal))}</td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums">{formatPWSI(BigInt(e.lotteryTotal))}</td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums">{e.recipients}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-flex items-center gap-3 font-mono text-[11px]">
                        <a className="text-ion hover:underline" href={`/api/rewards/epochs/${e.epochId}`} target="_blank" rel="noreferrer">proofs</a>
                        {e.txHash && <a className="text-mist hover:text-ink" href={explorerTx(e.txHash)} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /></a>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </section>
  );
}
