"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { motion } from "motion/react";
import { ExternalLink, Flame } from "lucide-react";
import { useProtocolStats } from "@/lib/hooks/use-game";
import { explorerTx, explorerAddress } from "@/lib/chains";
import { addresses } from "@/lib/contracts";
import { formatPWSI, timeAgo } from "@/lib/format";
import { shortAddress } from "@/lib/utils";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Counter } from "@/components/ui/counter";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { BurnEvent } from "@/server/indexer";

const ROUTE_META: Record<BurnEvent["route"], { label: string; color: string; tone: "si" | "ion" | "neutral" | "legend" }> = {
  "marketplace-fee": { label: "Market fee", color: "#ff3b30", tone: "si" },
  sink: { label: "Sink", color: "#ffb547", tone: "legend" },
  primary: { label: "Claim", color: "#8ff3ff", tone: "ion" },
  buyback: { label: "Buyback", color: "#4ade80", tone: "neutral" },
  direct: { label: "Direct", color: "#8a93a6", tone: "neutral" },
};

const n = (v?: bigint) => (v === undefined ? 0 : Number(formatUnits(v, 18)));

export function BurnDashboard() {
  const { data: s } = useProtocolStats();
  const { data, isLoading } = useQuery<{ burns: BurnEvent[]; latestBlock: number }>({
    queryKey: ["burns"],
    queryFn: () => fetch("/api/burns").then((r) => r.json()),
    refetchInterval: 20_000,
  });
  const burns = useMemo(() => data?.burns ?? [], [data]);

  const series = useMemo(() => {
    const out: { t: number; v: number }[] = [];
    let acc = 0;
    for (const b of burns) {
      acc += Number(formatUnits(BigInt(b.amount), 18));
      out.push({ t: b.timestamp, v: acc });
    }
    return out;
  }, [burns]);

  const pctSupply = s && s.minted > 0n ? (n(s.burned) / n(s.minted)) * 100 : 0;

  return (
    <section className="mx-auto flex max-w-[1400px] flex-col gap-6 px-5 py-10 md:px-8">
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel hud className="relative overflow-hidden">
          <div className="pointer-events-none absolute -left-20 -top-32 size-96 rounded-full bg-solar/10 blur-3xl" />
          <div className="relative p-7 md:p-9">
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-mist"><Flame className="size-4 text-solar" /> Total PWSI burned</span>
            <div className="mt-3 font-display text-7xl font-bold tabular-nums tracking-[-0.045em] text-solar md:text-8xl" data-testid="total-burned">
              <Counter value={n(s?.burned)} />
            </div>
            <div className="mt-2 font-mono text-sm text-mist">{pctSupply.toFixed(2)}% of all PWSI ever minted</div>
            <BurnChart series={series} />
          </div>
        </Panel>
        <div className="grid gap-6">
          <Panel>
            <PanelHeader><h3 className="font-display text-lg font-bold tracking-tight">By route</h3></PanelHeader>
            <ul className="grid gap-4 p-5">
              {[
                { label: "Primary claims (50%)", v: n(s?.primaryBurned), color: "bg-ion" },
                { label: "Upgrades · shields · missions", v: n(s?.sinkBurned), color: "bg-solar" },
                { label: "Marketplace fees (1%)", v: n(s?.feeBurned), color: "bg-si" },
                { label: "DEX buyback (mainnet)", v: n(s?.buybackBurned), color: "bg-ok" },
              ].map((r) => {
                const total = n(s?.burned) || 1;
                return (
                  <li key={r.label}>
                    <div className="mb-1.5 flex justify-between text-sm"><span className="text-haze">{r.label}</span><span className="font-mono tabular-nums">{r.v.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-line"><motion.div className={`h-full ${r.color}`} initial={{ width: 0 }} animate={{ width: `${(r.v / total) * 100}%` }} transition={{ duration: 1 }} /></div>
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Panel>
            <div className="grid grid-cols-3 divide-x divide-line">
              {[
                ["Circulating", formatPWSI(s?.supply, { compact: true })],
                ["Minted", formatPWSI(s?.minted, { compact: true })],
                ["Burn events", burns.length.toString()],
              ].map(([k, v]) => (
                <div key={k} className="p-5"><div className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist">{k}</div><div className="mt-1 font-display text-xl font-bold tabular-nums">{v}</div></div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel>
          <PanelHeader><h3 className="font-display text-lg font-bold tracking-tight">Recent burns</h3><span className="font-mono text-xs text-mist">block {data?.latestBlock ?? "—"}</span></PanelHeader>
          {isLoading ? (
            <div className="grid gap-2 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
          ) : burns.length === 0 ? (
            <p className="p-5 text-sm text-mist">No burns yet. Claim a plot, upgrade or trade to light the first fire.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="burn-table">
                <thead className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-mist">
                  <tr className="border-b border-line"><th className="px-5 py-3 text-left font-normal">Route</th><th className="px-5 py-3 text-right font-normal">Amount</th><th className="px-5 py-3 text-left font-normal">From</th><th className="px-5 py-3 text-right font-normal">When</th><th className="px-5 py-3" /></tr>
                </thead>
                <tbody>
                  {[...burns].reverse().slice(0, 25).map((b, i) => {
                    const url = explorerTx(b.txHash);
                    return (
                      <tr key={`${b.txHash}-${i}`} className="border-b border-line/60 last:border-0">
                        <td className="px-5 py-3"><Badge tone={ROUTE_META[b.route].tone}>{ROUTE_META[b.route].label}</Badge></td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums text-solar">{formatPWSI(BigInt(b.amount))}</td>
                        <td className="px-5 py-3 font-mono text-xs text-haze">{shortAddress(b.from)}</td>
                        <td className="px-5 py-3 text-right font-mono text-xs text-mist">{b.timestamp ? timeAgo(b.timestamp * 1000) : `#${b.block}`}</td>
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
          <PanelHeader><h3 className="font-display text-lg font-bold tracking-tight">How the treasury burns</h3></PanelHeader>
          <div className="grid gap-5 p-5 text-sm leading-relaxed text-haze">
            <Step n="01" title="Fee capture">Every marketplace sale sends {s ? s.feeBps / 100 : 1}% of the price to the BuybackBurnTreasury{addresses && (<> (<a className="text-ion hover:underline" href={explorerAddress(addresses.treasury)} target="_blank" rel="noreferrer">{shortAddress(addresses.treasury)}</a>)</>)}.</Step>
            <Step n="02" title="Instant burn">The marketplace calls <code className="font-mono text-ion">burnAccrued()</code> in the same transaction, so the treasury never holds PWSI. Anyone can call it too.</Step>
            <Step n="03" title="Mainnet buyback">With a live PWSI/ETH pool, a keeper calls <code className="font-mono text-ion">buybackAndBurn(eth, minOut, deadline)</code>: treasury ETH is swapped for PWSI through a Uniswap-V2-style router and the output is burned, with on-chain slippage protection.</Step>
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

function BurnChart({ series }: { series: { t: number; v: number }[] }) {
  const W = 640;
  const H = 180;
  if (series.length < 2) return <div className="mt-8 grid h-[180px] place-items-center rounded-sm border border-dashed border-line font-mono text-xs text-mist">Chart appears after the first burns</div>;
  const max = series[series.length - 1]!.v || 1;
  const pts = series.map((p, i) => [(i / (series.length - 1)) * W, H - (p.v / max) * (H - 12) - 4] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-8 h-[180px] w-full" preserveAspectRatio="none" aria-label="Cumulative burn">
      <defs>
        <linearGradient id="burnfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#ffb547" stopOpacity="0.35" /><stop offset="100%" stopColor="#ffb547" stopOpacity="0" /></linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="#1c2230" strokeDasharray="3 5" />)}
      <motion.path d={area} fill="url(#burnfill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }} />
      <motion.path d={line} fill="none" stroke="#ffb547" strokeWidth="2" vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }} />
    </svg>
  );
}
