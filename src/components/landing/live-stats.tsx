"use client";

import { formatUnits } from "viem";
import { Counter } from "@/components/ui/counter";
import { useProtocolStats } from "@/lib/hooks/use-game";
import { useSiFeed } from "@/lib/hooks/use-si-feed";
import { PLANETS } from "@/lib/planets";
import { PRE_LAUNCH } from "@/components/launch/prelaunch";

const TOTAL_PLOTS = PLANETS.reduce((a, p) => a + p.supply, 0);

const n = (v?: bigint) => (v === undefined ? 0 : Number(formatUnits(v, 18)));

export function LiveStatsBar() {
  const { data: s } = useProtocolStats();
  const { data: feed } = useSiFeed();
  const active = feed?.attacks.filter((a) => a.status === "active").length ?? 0;
  const avg = feed ? feed.control.reduce((a, c) => a + c.control, 0) / feed.control.length : 0;

  const items = PRE_LAUNCH
    ? [
        { label: "Status", value: <span className="text-[0.8em]">Launching soon</span>, accent: "text-solar" },
        { label: "Worlds", value: <Counter value={PLANETS.length} /> },
        { label: "Plots to reclaim", value: <Counter value={TOTAL_PLOTS} /> },
        { label: "Revenue split", value: <span>10 / 90</span>, accent: "text-ion" },
        { label: "SI control", value: <><Counter value={avg} decimals={1} />%</>, accent: "text-si" },
        { label: "Active attacks", value: <Counter value={active} />, accent: active ? "text-si" : undefined },
      ]
    : [
    { label: "PWSI burned", value: <Counter value={n(s?.burned)} />, accent: "text-solar" },
    { label: "Reward pool", value: <Counter value={n(s?.rewardsAvailable)} />, accent: "text-ion" },
    { label: "Plots reclaimed", value: <Counter value={Number(s?.territoriesClaimed ?? 0n)} /> },
    { label: "Market trades", value: <Counter value={Number(s?.trades ?? 0n)} /> },
    { label: "SI control", value: <><Counter value={avg} decimals={1} />%</>, accent: "text-si" },
    { label: "Active attacks", value: <Counter value={active} />, accent: active ? "text-si" : undefined },
  ];

  return (
    <div className="border-t border-line/70 bg-void/60 backdrop-blur-md">
      <div className="mx-auto grid max-w-[1400px] grid-cols-2 divide-line/70 px-5 sm:grid-cols-3 md:grid-cols-6 md:divide-x md:px-8">
        {items.map((it, i) => (
          <div key={it.label} className={`flex flex-col gap-1 py-4 md:px-6 ${i === 0 ? "md:pl-0" : ""} ${i > 2 ? "hidden md:flex" : ""}`}>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-mist">{it.label}</span>
            <span className={`font-display text-xl font-bold tabular-nums tracking-tight md:text-2xl ${it.accent ?? ""}`}>{it.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
