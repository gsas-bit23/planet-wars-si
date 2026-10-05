"use client";

import Link from "next/link";
import { formatUnits } from "viem";
import { ArrowRight } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { Counter } from "@/components/ui/counter";
import { Panel } from "@/components/ui/panel";
import { useProtocolStats } from "@/lib/hooks/use-game";
import { Reveal } from "./reveal";
import { IS_TESTNET } from "@/lib/chains";

const n = (v?: bigint) => (v === undefined ? 0 : Number(formatUnits(v, 18)));

export function Tokenomics() {
  const { data: s } = useProtocolStats();
  const burnPct = s ? s.burnBps / 100 : 10;
  const routes = [
    { label: "Burned forever", sub: `${burnPct}% of all revenue`, value: n(s?.burned), color: "bg-solar" },
    { label: "Reward pool", sub: `${100 - burnPct}% of all revenue → leaderboard + lottery`, value: n(s?.pooled), color: "bg-ion" },
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
                Spent means <span className="text-solar">burned</span> <span className="font-serif font-normal italic text-ion">and</span> shared.
              </>
            }
            description={`PWSI is the game's utility token. There is no staking, no yield and no promise of value. All game revenue (claims, upgrades, shields, missions, the 1% market fee) is split on arrival: 10% is burned, 90% funds daily leaderboard and lottery rewards. ${IS_TESTNET ? "On this test network a rate-limited faucet is the only mint." : "The token launches on the pons launchpad on Robinhood Chain with a fixed supply; the game itself can never mint."}`}
          />
          <ul className="mt-10 grid gap-3 text-sm text-haze">
            <li className="flex gap-3"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-solar" />Burn share bounded to 5–50% on-chain; any change waits behind a 2-day timelock.</li>
            <li className="flex gap-3"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-ion" />Each day pays at most 20% of the unallocated pool: top 100 by score (70%) and 100 random active players (30%).</li>
            <li className="flex gap-3"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-si" />Rewards are claimed with Merkle proofs; unclaimed amounts return to the pool after 30 days.</li>
          </ul>
          <Link href="/burn" className="mt-8 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink hover:text-solar">
            Open the revenue dashboard <ArrowRight className="size-4" />
          </Link>
        </Reveal>

        <Reveal delay={0.1}>
          <Panel hud className="p-7 md:p-9">
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-mist">Game revenue processed · live from chain</span>
              <span className="font-display text-6xl font-bold tabular-nums tracking-[-0.04em] text-ink md:text-7xl">
                <Counter value={n(s?.revenue)} />
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
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist">Rewards claimed</div>
                <div className="mt-1 font-display text-lg font-bold tabular-nums"><Counter value={n(s?.totalClaimed)} /></div>
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
