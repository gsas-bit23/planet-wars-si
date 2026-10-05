"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { Crown, Info, Trophy } from "lucide-react";
import { useProtocolStats } from "@/lib/hooks/use-game";
import { formatPWSI } from "@/lib/format";
import { cn, shortAddress } from "@/lib/utils";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat } from "@/components/ui/stat";
import type { LeaderboardResponse, RewardsResponse } from "./types";

export function Leaderboard() {
  const { address } = useAccount();
  const me = address?.toLowerCase();
  const { data: stats } = useProtocolStats();
  const { data: rewards } = useQuery<RewardsResponse>({ queryKey: ["rewards"], queryFn: () => fetch("/api/rewards").then((r) => r.json()) });
  const [picked, setPicked] = useState<string | null>(null); // null → server's "today"
  const { data, isLoading } = useQuery<LeaderboardResponse>({
    queryKey: ["leaderboard", picked],
    queryFn: () => fetch(`/api/leaderboard${picked ? `?day=${picked}` : ""}`).then((r) => r.json()),
    refetchInterval: picked ? false : 30_000,
  });
  const today = data?.today;
  const day = picked ?? data?.day ?? "";
  const days = useMemo(() => {
    const past = (rewards?.epochs ?? []).filter((e) => e.kind === "rewards" && e.day).map((e) => e.day!);
    return [...new Set([...(today ? [today] : []), ...past])].slice(0, 14);
  }, [rewards, today]);
  const rows = data?.rows ?? [];
  const lbPot = stats ? (stats.epochCap * 7000n) / 10000n : undefined;
  const sumBps = rows.reduce((a, r) => a + r.tierBps, 0) || 1;
  const published = data?.epoch?.status === "published";
  const est = (bps: number) => {
    if (published && data?.epoch) return (BigInt(data.epoch.leaderboardTotal) * BigInt(bps)) / BigInt(sumBps);
    return lbPot !== undefined ? (lbPot * BigInt(bps)) / BigInt(sumBps) : undefined;
  };
  const myRow = rows.find((r) => r.account === me);

  return (
    <section className="mx-auto flex max-w-[1400px] flex-col gap-6 px-5 py-10 md:px-8">
      <div className="grid gap-6 md:grid-cols-4">
        <Panel className="p-5"><Stat label={published ? "Paid to top 100" : "Today's top-100 pot (est.)"} value={formatPWSI(published ? BigInt(data!.epoch!.leaderboardTotal) : lbPot, { compact: true })} tone="ion" sub="70% of the daily epoch budget" /></Panel>
        <Panel className="p-5"><Stat label="Ranked players" value={rows.length} sub="needs ≥1 qualifying action that day" /></Panel>
        <Panel className="p-5"><Stat label="Your rank" value={myRow ? `#${myRow.rank}` : "—"} tone="solar" sub={myRow ? `score ${myRow.score}` : address ? "not ranked yet" : "connect a wallet"} /></Panel>
        <Panel className="p-5"><Stat label="Reward pool" value={formatPWSI(stats?.rewardsAvailable, { compact: true })} sub="unallocated rewards" /></Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Panel>
          <PanelHeader>
            <div className="flex items-center gap-2"><Trophy className="size-4 text-solar" /><h3 className="font-display text-lg font-bold tracking-tight">Daily leaderboard · {day} UTC</h3></div>
            <div className="flex items-center gap-2">
              <Badge tone={data?.provisional ? "legend" : "ion"}>{data?.provisional ? "live · provisional" : "final · published"}</Badge>
              <select aria-label="Day" value={day} onChange={(e) => setPicked(e.target.value === today ? null : e.target.value)} className="rounded-xs border border-line bg-void px-2 py-1 font-mono text-xs text-haze">
                {days.map((d) => <option key={d} value={d}>{d === today ? `${d} (today)` : d}</option>)}
              </select>
            </div>
          </PanelHeader>
          {isLoading ? (
            <div className="grid gap-2 p-5">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-mist" data-testid="leaderboard-empty">Nobody has ranked for this day yet. Hold a plot for 24 hours and take any game action (upgrade, shield, mission, SI defense) to enter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="leaderboard-table">
                <thead className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-mist">
                  <tr className="border-b border-line">
                    <th className="px-5 py-3 text-left font-normal">Rank</th>
                    <th className="px-5 py-3 text-left font-normal">Commander</th>
                    <th className="px-5 py-3 text-right font-normal">Score</th>
                    <th className="hidden px-5 py-3 text-right font-normal md:table-cell">Plots ≥24h</th>
                    <th className="hidden px-5 py-3 text-right font-normal md:table-cell">Activity</th>
                    <th className="px-5 py-3 text-right font-normal">{published ? "Reward" : "Est. reward"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.account} className={cn("border-b border-line/60 last:border-0", r.account === me && "bg-ion/[0.06]")}>
                      <td className="px-5 py-3 font-mono tabular-nums">{r.rank <= 3 ? <span className="inline-flex items-center gap-1.5 text-solar"><Crown className="size-3.5" />{r.rank}</span> : r.rank}</td>
                      <td className="px-5 py-3 font-mono text-xs text-haze">{shortAddress(r.account)}{r.account === me && <span className="ml-2 text-ion">you</span>}</td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-ink">{r.score.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="hidden px-5 py-3 text-right font-mono tabular-nums text-mist md:table-cell">{r.breakdown.plots} · {r.breakdown.holdScore.toFixed(1)}</td>
                      <td className="hidden px-5 py-3 text-right font-mono tabular-nums text-mist md:table-cell">{r.breakdown.activityScore}</td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-ion">{formatPWSI(est(r.tierBps))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="grid content-start gap-6">
          <Panel tone="ion">
            <PanelHeader><div className="flex items-center gap-2"><Info className="size-4 text-ion" /><h3 className="font-display text-lg font-bold tracking-tight">How the score works</h3></div></PanelHeader>
            <div className="grid gap-4 p-5 text-sm leading-relaxed text-haze">
              <p><span className="text-ink">Holdings:</span> each plot you have held for at least 24 hours at the end of the UTC day scores its zone weight (common 1 · rare 2.5 · legendary 6) × (1 + level/4).</p>
              <p><span className="text-ink">Activity, capped per day:</span> upgrades 3 pts (max 5), shields 2 (max 5), missions 1 (max 5), SI defenses 1 (max 5).</p>
              <p><span className="text-ink">Must play:</span> only wallets with at least one qualifying action that day are ranked.</p>
              <p><span className="text-ink">No wash trading:</span> marketplace trades score 0, and buying a plot restarts its 24-hour clock, so passing plots between your own wallets earns nothing and costs the 1% fee.</p>
            </div>
          </Panel>
          <Panel>
            <PanelHeader><h3 className="font-display text-lg font-bold tracking-tight">Payout curve (top 100)</h3></PanelHeader>
            <ul className="grid gap-2 p-5 font-mono text-xs">
              {[["#1", "10%"], ["#2", "6%"], ["#3", "4%"], ["#4–10", "2% each"], ["#11–25", "1% each"], ["#26–50", "0.8% each"], ["#51–100", "0.62% each"]].map(([k, v]) => (
                <li key={k} className="flex justify-between border-b border-line/50 pb-2 last:border-0"><span className="text-mist">{k}</span><span className="text-ink">{v}</span></li>
              ))}
              <li className="pt-1 text-[11px] leading-relaxed text-mist">Shares of the leaderboard pot. With fewer than 100 ranked players the shares are renormalised across those present. Paid from the reward pool only; amounts depend on game revenue and are never guaranteed.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </section>
  );
}
