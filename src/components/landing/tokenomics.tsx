"use client";

import Link from "next/link";
import { formatUnits } from "viem";
import { ArrowRight } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { Counter } from "@/components/ui/counter";
import { Panel } from "@/components/ui/panel";
import { useProtocolStats } from "@/lib/hooks/use-game";
import { Reveal } from "./reveal";

const n = (v?: bigint) => (v === undefined ? 0 : Number(formatUnits(v, 18)));

export function Tokenomics() {
  const { data: s } = useProtocolStats();
  const routes = [
    { label: "Primary claims", sub: "50% of every claim", value: n(s?.primaryBurned), color: "bg-ion" },
    { label: "Upgrades, shields, missions", sub: "100% of sink spend", value: n(s?.sinkBurned), color: "bg-solar" },
    { label: "Marketplace fees", sub: `${(s?.feeBps ?? 100) / 100}% of every sale`, value: n(s?.feeBurned), color: "bg-si" },
  ];
  const total = routes.reduce((a, r) => a + r.value, 0) || 1;

  return (
    <section className="relative overflow-hidden border-t border-line py-32">
      <div className="pointer-events-none absolute -right-40 top-10 size-[640px] rounded-full bg-si/10 blur-[140px]" />
      <div className="relative mx-auto grid max-w-[1400px] gap-14 px-5 md:px-8 lg:grid-cols-[1fr_1.15fr]">
        <Reveal>
          <SectionHeading
            index="04"
            eyebrow="$PWSI tokenomics"
            title={
              <>
                Spent means <span className="text-solar">burned.</span>
              </>
            }
            description="PWSI is the game's utility token. There is no staking, no yield and no promise of value — it fuels claims, upgrades and trades, and every sink destroys supply. On testnet a rate-limited faucet is the only mint."
          />
          <ul className="mt-10 grid gap-3 text-sm text-haze">
            <li className="flex gap-3"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-ion" />Lifetime mint cap of 1B PWSI — burned tokens can never be re-minted.</li>
            <li className="flex gap-3"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-si" />1% marketplace fee → BuybackBurnTreasury → burned in the same transaction.</li>
            <li className="flex gap-3"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-solar" />On mainnet the treasury can also swap ETH revenue for PWSI on a DEX and burn it.</li>
          </ul>
          <Link href="/burn" className="mt-8 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink hover:text-solar">
            Open the burn dashboard <ArrowRight className="size-4" />
          </Link>
        </Reveal>

        <Reveal delay={0.1}>
          <Panel hud className="p-7 md:p-9">
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-mist">Total PWSI burned · live from chain</span>
              <span className="font-display text-6xl font-extrabold tabular-nums tracking-[-0.04em] text-solar md:text-7xl">
                <Counter value={n(s?.burned)} />
              </span>
            </div>
            <div className="mt-8 flex h-3 overflow-hidden rounded-full bg-line">
              {routes.map((r) => (
                <div key={r.label} className={`${r.color} h-full transition-[width] duration-700`} style={{ width: `${(r.value / total) * 100}%` }} />
              ))}
            </div>
            <div className="mt-6 grid gap-4">
              {routes.map((r) => (
                <div key={r.label} className="flex items-center justify-between border-b border-line pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <span className={`size-2.5 rounded-xs ${r.color}`} />
                    <div>
                      <div className="text-sm text-ink">{r.label}</div>
                      <div className="font-mono text-[11px] text-mist">{r.sub}</div>
                    </div>
                  </div>
                  <span className="font-mono text-sm tabular-nums">
                    <Counter value={r.value} /> <span className="text-mist">PWSI</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-8 grid grid-cols-3 gap-4 border-t border-line pt-6">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist">Circulating</div>
                <div className="mt-1 font-display text-lg font-bold tabular-nums"><Counter value={n(s?.supply)} /></div>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist">Minted</div>
                <div className="mt-1 font-display text-lg font-bold tabular-nums"><Counter value={n(s?.minted)} /></div>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist">Volume</div>
                <div className="mt-1 font-display text-lg font-bold tabular-nums"><Counter value={n(s?.volume)} /></div>
              </div>
            </div>
          </Panel>
        </Reveal>
      </div>
    </section>
  );
}
