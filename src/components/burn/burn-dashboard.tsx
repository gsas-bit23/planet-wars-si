"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { motion } from "motion/react";
import { Coins, ExternalLink, Flame } from "lucide-react";
import { useProtocolStats } from "@/lib/hooks/use-game";
import { explorerTx, explorerAddress } from "@/lib/chains";
import { addresses } from "@/lib/contracts";
import { formatPWSI, timeAgo } from "@/lib/format";
import { shortAddress } from "@/lib/utils";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Counter } from "@/components/ui/counter";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { REVENUE_SOURCE_KEYS, type RevenueEvent, type RevenueSource } from "@/lib/revenue";

const SOURCE_META: Record<RevenueSource, { label: string; color: string; tone: "si" | "ion" | "neutral" | "legend" }> = {
  claim: { label: "Plot claim", color: "bg-ion", tone: "ion" },
  upgrade: { label: "Upgrade", color: "bg-solar", tone: "legend" },
  shield: { label: "Shield", color: "bg-solar", tone: "legend" },
  mission: { label: "Mission", color: "bg-solar", tone: "legend" },
  "market-fee": { label: "Market fee", color: "bg-si", tone: "si" },
  royalty: { label: "Royalty", color: "bg-ok", tone: "neutral" },
  buyback: { label: "Buyback", color: "bg-ok", tone: "neutral" },
  other: { label: "Other", color: "bg-mist", tone: "neutral" },
};

const n = (v?: bigint) => (v === undefined ? 0 : Number(formatUnits(v, 18)));
const fmt = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function BurnDashboard() {
  const { data: s } = useProtocolStats();
  const { data, isLoading } = useQuery<{ events: RevenueEvent[]; latestBlock: number }>({
    queryKey: ["revenue-events"],
    queryFn: () => fetch("/api/burns").then((r) => r.json()),
    refetchInterval: 20_000,
  });
  const events = useMemo(() => data?.events ?? [], [data]);

  const series = useMemo(() => {
    const out: { t: number; burned: number; pooled: number }[] = [];
    let b = 0;
    let p = 0;
    for (const e of events) {
      b += Number(formatUnits(BigInt(e.burned), 18));
      p += Number(formatUnits(BigInt(e.pooled), 18));
      out.push({ t: e.timestamp, burned: b, pooled: p });
    }
    return out;
  }, [events]);

  const burnPct = s ? s.burnBps / 100 : 10;
  const pending = s && s.pendingBurnBpsEta > 0;

  return (
    <section className="mx-auto flex max-w-[1400px] flex-col gap-6 px-5 py-10 md:px-8">
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel hud className="relative overflow-hidden">
          <div className="pointer-events-none absolute -left-20 -top-32 size-96 rounded-full bg-solar/10 blur-3xl" />
          <div className="relative grid gap-8 p-7 md:p-9">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-mist"><Flame className="size-4 text-solar" /> Burned ({burnPct}%)</span>
                <div className="mt-3 font-display text-5xl font-bold tabular-nums tracking-[-0.04em] text-solar md:text-6xl" data-testid="total-burned">
                  <Counter value={n(s?.burned)} />
                </div>
              </div>
              <div>
                <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-mist"><Coins className="size-4 text-ion" /> To reward pool ({100 - burnPct}%)</span>
                <div className="mt-3 font-display text-5xl font-bold tabular-nums tracking-[-0.04em] text-ion md:text-6xl" data-testid="total-pooled">
                  <Counter value={n(s?.pooled)} />
                </div>
              </div>
            </div>
            <div className="font-mono text-sm text-mist">
              {fmt(n(s?.revenue))} PWSI of game revenue processed · every PWSI spent in the game is split in the same transaction
            </div>
            <RevenueChart series={series} />
          </div>
        </Panel>
        <div className="grid gap-6">
          <Panel>
            <PanelHeader><h3 className="font-display text-lg font-bold tracking-tight">Revenue by source</h3></PanelHeader>
            <ul className="grid gap-4 p-5">
              {(s?.bySource ?? []).map((v, i) => ({ key: REVENUE_SOURCE_KEYS[i]!, v: n(v) }))
                .filter((r) => r.v > 0 || ["claim", "upgrade", "market-fee"].includes(r.key))
                .map((r) => {
                  const total = n(s?.revenue) || 1;
                  const meta = SOURCE_META[r.key];
                  return (
                    <li key={r.key}>
                      <div className="mb-1.5 flex justify-between text-sm"><span className="text-haze">{meta.label}</span><span className="font-mono tabular-nums">{fmt(r.v)}</span></div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-line"><motion.div className={`h-full ${meta.color}`} initial={{ width: 0 }} animate={{ width: `${(r.v / total) * 100}%` }} transition={{ duration: 1 }} /></div>
                    </li>
                  );
                })}
            </ul>
          </Panel>
          <Panel>
            <div className="grid grid-cols-3 divide-x divide-line">
              {[
                ["Pool: rewards", formatPWSI(s?.rewardsAvailable, { compact: true })],
                ["Pool: airdrop", formatPWSI(s?.airdropAvailable, { compact: true })],
                ["Claimed", formatPWSI(s?.totalClaimed, { compact: true })],
              ].map(([k, v]) => (
                <div key={k} className="p-5"><div className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist">{k}</div><div className="mt-1 font-display text-xl font-bold tabular-nums">{v}</div></div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel>
          <PanelHeader><h3 className="font-display text-lg font-bold tracking-tight">Recent revenue</h3><span className="font-mono text-xs text-mist">block {data?.latestBlock ?? "—"}</span></PanelHeader>
          {isLoading ? (
            <div className="grid gap-2 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
          ) : events.length === 0 ? (
            <p className="p-5 text-sm text-mist">No revenue yet. Claim a plot, upgrade or trade to fund the first rewards.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="burn-table">
                <thead className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-mist">
                  <tr className="border-b border-line"><th className="px-5 py-3 text-left font-normal">Source</th><th className="px-5 py-3 text-right font-normal">Burned</th><th className="px-5 py-3 text-right font-normal">Pooled</th><th className="px-5 py-3 text-left font-normal">From</th><th className="px-5 py-3 text-right font-normal">When</th><th className="px-5 py-3" /></tr>
                </thead>
                <tbody>
                  {[...events].reverse().slice(0, 25).map((e, i) => {
                    const url = explorerTx(e.txHash);
                    const meta = SOURCE_META[e.source] ?? SOURCE_META.other;
                    return (
                      <tr key={`${e.txHash}-${i}`} className="border-b border-line/60 last:border-0">
                        <td className="px-5 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums text-solar">{formatPWSI(BigInt(e.burned))}</td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums text-ion">{formatPWSI(BigInt(e.pooled))}</td>
                        <td className="px-5 py-3 font-mono text-xs text-haze">{shortAddress(e.from)}</td>
                        <td className="px-5 py-3 text-right font-mono text-xs text-mist">{e.timestamp ? timeAgo(e.timestamp * 1000) : `#${e.block}`}</td>
                        <td className="px-5 py-3 text-right">{url && <a href={url} target="_blank" rel="noreferrer" className="text-mist hover:text-ink"><ExternalLink className="size-3.5" /></a>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel tone="ion">
          <PanelHeader><h3 className="font-display text-lg font-bold tracking-tight">How revenue flows</h3></PanelHeader>
          <div className="grid gap-5 p-5 text-sm leading-relaxed text-haze">
            <Step n="01" title="One treasury for everything">Plot claims, upgrades, shields, missions and the {s ? s.feeBps / 100 : 1}% marketplace fee all pay the RevenueTreasury{addresses && (<> (<a className="text-ion hover:underline" href={explorerAddress(addresses.treasury)} target="_blank" rel="noreferrer">{shortAddress(addresses.treasury)}</a>)</>)}. ERC-2981 royalties from external marketplaces land there too.</Step>
            <Step n="02" title={`Split on arrival: ${burnPct}% burn / ${100 - burnPct}% rewards`}>The treasury never holds PWSI. Each payment is split in the same transaction: the burn share is destroyed and the rest goes to the RewardPool{addresses && (<> (<a className="text-ion hover:underline" href={explorerAddress(addresses.rewardPool)} target="_blank" rel="noreferrer">{shortAddress(addresses.rewardPool)}</a>)</>)}.</Step>
            <Step n="03" title="Bounded and timelocked">The owner can move the burn share only between 5% and 50%, and every change waits 2 days on-chain before it applies.{pending && <> A change to {s!.pendingBurnBps / 100}% is queued (applies {new Date(s!.pendingBurnBpsEta * 1000).toUTCString()}).</>}</Step>
            <Step n="04" title="Rewards, not returns">The pool pays the daily leaderboard and lottery. Each day can use at most a capped share of the unallocated pool (20% by default), so payouts shrink when revenue does. Nothing here is a promised return.</Step>
          </div>
        </Panel>
      </div>
    </section>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[32px_1fr] gap-3">
      <span className="font-mono text-xs text-ion">{n}</span>
      <div><div className="font-medium text-ink">{title}</div><p className="mt-1 text-mist">{children}</p></div>
    </div>
  );
}

function RevenueChart({ series }: { series: { t: number; burned: number; pooled: number }[] }) {
  const W = 640;
  const H = 180;
  if (series.length < 2) return <div className="grid h-[180px] place-items-center rounded-sm border border-dashed border-line font-mono text-xs text-mist">Chart appears after the first revenue</div>;
  const last = series[series.length - 1]!;
  const max = last.burned + last.pooled || 1;
  const path = (f: (p: (typeof series)[number]) => number) =>
    series.map((p, i) => `${i ? "L" : "M"}${((i / (series.length - 1)) * W).toFixed(1)},${(H - (f(p) / max) * (H - 12) - 4).toFixed(1)}`).join(" ");
  const total = path((p) => p.burned + p.pooled);
  const burned = path((p) => p.burned);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[180px] w-full" preserveAspectRatio="none" aria-label="Cumulative revenue: burned vs pooled">
      <defs>
        <linearGradient id="poolfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8ff3ff" stopOpacity="0.25" /><stop offset="100%" stopColor="#8ff3ff" stopOpacity="0" /></linearGradient>
        <linearGradient id="burnfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#ffb547" stopOpacity="0.45" /><stop offset="100%" stopColor="#ffb547" stopOpacity="0" /></linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="#1c2230" strokeDasharray="3 5" />)}
      <motion.path d={`${total} L${W},${H} L0,${H} Z`} fill="url(#poolfill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }} />
      <motion.path d={total} fill="none" stroke="#8ff3ff" strokeWidth="2" vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6 }} />
      <motion.path d={`${burned} L${W},${H} L0,${H} Z`} fill="url(#burnfill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }} />
      <motion.path d={burned} fill="none" stroke="#ffb547" strokeWidth="2" vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6 }} />
    </svg>
  );
}
