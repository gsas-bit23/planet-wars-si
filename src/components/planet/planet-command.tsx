"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { useAccount } from "wagmi";
import { parseUnits, type Abi } from "viem";
import { ArrowLeft, Crosshair, Rocket, ShieldAlert, X } from "lucide-react";
import { PLANET_BY_SLUG, PLANETS, ZONE_COLORS, ZONE_LABELS, MISSIONS, encodeTokenId, plotLabel } from "@/lib/planets";
import { addresses, isDeployed, opsAbi, territoryAbi } from "@/lib/contracts";
import { getPwsiLink } from "@/lib/contracts";
import { decodeBitmap, useActiveListings, useBodies, useClaimedBitmap, useMyTerritories, usePwsiBalance, useZones } from "@/lib/hooks/use-game";
import { useControlMap, useSiFeed } from "@/lib/hooks/use-si-feed";
import { useEnsureAllowance, useTx } from "@/lib/hooks/use-tx";
import { formatPWSI } from "@/lib/format";
import { TerritoryGrid } from "./territory-grid";
import { Panel, PanelHeader, Eyebrow } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { WalletButton } from "@/components/layout/connect-button";
import { FollowOnX, PRE_LAUNCH } from "@/components/launch/prelaunch";
import { cn } from "@/lib/utils";

const PlanetView = dynamic(() => import("@/components/three/planet-view"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse rounded-full bg-[radial-gradient(circle,#1c2230,transparent_60%)]" />,
});

const MULT = [1, 2.5, 10];
const MAX_SELECT = 25;

export function PlanetCommand({ slug }: { slug: string }) {
  const planet = PLANET_BY_SLUG[slug]!;
  const params = useSearchParams();
  const focusPlot = params.get("plot") ? Number(params.get("plot")) : null;
  const { isConnected } = useAccount();
  const { data: bodies } = useBodies();
  const body = bodies?.[planet.bodyId - 1];
  const supply = body ? Number(body.supply) : planet.supply;
  const cols = body ? Number(body.cols) : planet.cols;
  const basePrice = body ? body.basePrice : parseUnits(String(planet.basePrice), 18);
  const liveZones = useZones(planet.bodyId, supply, cols);
  // Zones derive from the deployed contract's salt, so they are unknown before launch: show a
  // uniform grid rather than a misleading preview.
  const preZones = useMemo(() => (PRE_LAUNCH ? new Array(supply).fill(0) : null), [supply]);
  const zones = PRE_LAUNCH ? preZones : liveZones;
  const { data: bitmap, isLoading: bitmapLoading } = useClaimedBitmap(planet.bodyId);
  const claimed = useMemo(() => decodeBitmap(bitmap as bigint[] | undefined, supply), [bitmap, supply]);
  const { data: myIds } = useMyTerritories();
  const { data: listingsData } = useActiveListings();
  const { data: balance } = usePwsiBalance();
  const control = useControlMap()[planet.bodyId] ?? planet.siControl;
  const { data: feed } = useSiFeed();
  const attacks = (feed?.attacks ?? []).filter((a) => a.bodyId === planet.bodyId && (a.status === "active" || a.status === "incoming"));

  const mine = useMemo(() => {
    const s = new Set<number>();
    for (const id of myIds ?? []) if (Number(id / 1_000_000n) === planet.bodyId) s.add(Number(id % 1_000_000n));
    return s;
  }, [myIds, planet.bodyId]);

  const listed = useMemo(() => {
    const m = new Map<number, bigint>();
    const [ids, ls] = listingsData ?? [[], []];
    ids.forEach((id, i) => {
      if (Number(id / 1_000_000n) === planet.bodyId) m.set(Number(id % 1_000_000n), ls[i]!.price);
    });
    return m;
  }, [listingsData, planet.bodyId]);
  const listedSet = useMemo(() => new Set(listed.keys()), [listed]);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const priceOf = (i: number) => (basePrice * BigInt(Math.round(MULT[zones?.[i] ?? 0]! * 10))) / 10n;
  const total = [...selected].reduce((a, i) => a + priceOf(i), 0n);
  const claimedCount = body ? Number(body.claimed) : claimed.reduce((a, b) => a + b, 0);

  const toggle = (i: number) => {
    if (PRE_LAUNCH || claimed[i]) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else if (next.size < MAX_SELECT) next.add(i);
      return next;
    });
  };

  const { send, pending } = useTx();
  const ensureAllowance = useEnsureAllowance();

  async function claim() {
    if (!addresses || selected.size === 0) return;
    const plots = [...selected].sort((a, b) => a - b);
    await ensureAllowance(addresses.territory, total);
    await send(plots.length === 1 ? `Claim ${plotLabel(encodeTokenId(planet.bodyId, plots[0]!))}` : `Claim ${plots.length} plots on ${planet.name}`, {
      address: addresses.territory,
      abi: territoryAbi as Abi,
      functionName: plots.length === 1 ? "claim" : "claimBatch",
      args: plots.length === 1 ? [BigInt(planet.bodyId), BigInt(plots[0]!)] : [BigInt(planet.bodyId), plots.map(BigInt)],
    });
    setSelected(new Set());
  }

  async function launchMission(type: number) {
    if (!addresses) return;
    const cost = parseUnits(String(MISSIONS[type]!.cost), 18);
    await ensureAllowance(addresses.ops, cost);
    await send(`Launch ${MISSIONS[type]!.name}`, {
      address: addresses.ops,
      abi: opsAbi as Abi,
      functionName: "launchMission",
      args: [BigInt(planet.bodyId), type],
    });
  }

  const hoverInfo = hover !== null ? { i: hover, zone: zones?.[hover] ?? 0 } : null;
  const idx = PLANETS.findIndex((p) => p.slug === slug);
  const prev = PLANETS[(idx + PLANETS.length - 1) % PLANETS.length]!;
  const next = PLANETS[(idx + 1) % PLANETS.length]!;

  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: `radial-gradient(60% 80% at 75% 40%, ${planet.glow}22, transparent 70%)` }} />
        <div className="relative mx-auto grid max-w-[1400px] items-center gap-8 px-5 pb-10 pt-[calc(var(--header-h)+28px)] md:px-8 lg:grid-cols-[1fr_1.05fr]">
          <div className="order-2 flex flex-col gap-6 lg:order-1">
            <Link href="/planets" className="inline-flex w-fit items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-mist hover:text-ink">
              <ArrowLeft className="size-3.5" /> All planets
            </Link>
            <div>
              <Eyebrow className="text-si">0{planet.bodyId} · {planet.siCodename} · {control.toFixed(1)}% SI control</Eyebrow>
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                className="mt-3 font-display text-7xl font-bold leading-[0.85] tracking-[-0.05em] md:text-9xl"
              >
                {planet.name}
              </motion.h1>
              <p className="mt-3 font-serif text-2xl italic text-ion">{planet.tagline}</p>
            </div>
            <p className="max-w-xl text-[15px] leading-relaxed text-haze">{planet.lore}</p>
            <dl className="grid max-w-xl grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
              {[
                ["Plots", supply.toLocaleString()],
                ["Reclaimed", claimedCount.toLocaleString()],
                ["Base price", `${formatPWSI(basePrice)} PWSI`],
                ["Grid", `${cols} × ${Math.ceil(supply / cols)}`],
              ].map(([k, v]) => (
                <div key={k} className="bg-abyss p-4">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist">{k}</dt>
                  <dd className="mt-1 font-display text-lg font-bold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-xs">
              {planet.facts.map((f) => (
                <div key={f.label}>
                  <span className="text-mist">{f.label}: </span>
                  <span className="text-haze">{f.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="relative order-1 aspect-square w-full max-w-[640px] justify-self-center lg:order-2">
            <PlanetView planet={planet} control={control / 100} className="absolute inset-0 [mask-image:radial-gradient(circle_at_center,black_58%,transparent_71%)]" />
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.2em] text-mist">Drag to rotate</div>
          </div>
        </div>
      </section>

      {/* Command deck */}
      <section className="mx-auto grid max-w-[1400px] items-start gap-6 px-5 py-10 md:px-8 xl:grid-cols-[1fr_380px]">
        <Panel className="min-w-0">
          <PanelHeader>
            <div className="flex items-center gap-3">
              <Crosshair className="size-4 text-ion" />
              <h2 className="font-display text-lg font-bold tracking-tight">Territory grid</h2>
              {PRE_LAUNCH && <Badge tone="legend">Zones revealed at launch</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-mist">
              {ZONE_LABELS.map((z, i) => (
                <span key={z} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[2px]" style={{ background: ZONE_COLORS[i] }} />
                  {z} {i > 0 && `×${MULT[i]}`}
                </span>
              ))}
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-[#0f4c58] ring-1 ring-ion" />Yours</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-[#3d2a08] ring-1 ring-solar" />Listed</span>
            </div>
          </PanelHeader>
          <div className="p-5">
            {!zones || (!PRE_LAUNCH && bitmapLoading) ? (
              <Skeleton className="aspect-[2/1] w-full" />
            ) : (
              <TerritoryGrid
                supply={supply}
                cols={cols}
                zones={zones}
                claimed={claimed}
                mine={mine}
                listed={listedSet}
                selected={selected}
                onToggle={toggle}
                onHover={setHover}
                focus={focusPlot}
              />
            )}
          </div>
          <div className="flex min-h-12 items-center justify-between gap-4 border-t border-line px-5 py-3 font-mono text-xs">
            {hoverInfo ? (
              <>
                <span className="text-ink">{plotLabel(encodeTokenId(planet.bodyId, hoverInfo.i))}</span>
                <span className="flex items-center gap-4">
                  <span style={{ color: ZONE_COLORS[hoverInfo.zone] === "#3a4252" ? "#b9c0cf" : ZONE_COLORS[hoverInfo.zone] }}>
                    {planet.zones[hoverInfo.zone]} · {ZONE_LABELS[hoverInfo.zone]}
                  </span>
                  <span className="text-mist">
                    {mine.has(hoverInfo.i)
                      ? "Yours"
                      : listed.has(hoverInfo.i)
                        ? `Listed · ${formatPWSI(listed.get(hoverInfo.i))} PWSI`
                        : claimed[hoverInfo.i]
                          ? "Claimed"
                          : `${formatPWSI(priceOf(hoverInfo.i))} PWSI`}
                  </span>
                </span>
              </>
            ) : (
              <span className="text-mist">Hover a plot for details · click open plots to select (max {MAX_SELECT})</span>
            )}
          </div>
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel hud>
            <PanelHeader>
              <h3 className="font-display text-lg font-bold tracking-tight">Claim order</h3>
              <span className="font-mono text-xs text-mist">{selected.size}/{MAX_SELECT}</span>
            </PanelHeader>
            <div className="flex flex-col gap-4 p-5">
              {PRE_LAUNCH ? (
                <p className="text-sm leading-relaxed text-mist" data-testid="claim-prelaunch">
                  All {supply.toLocaleString("en-US")} plots on {planet.name} are still held by the SI. Claiming opens at launch, right after the PWSI token goes live on pons. Common plots start at {planet.basePrice} PWSI; rare sectors cost ×2.5 and legendary sectors ×10.
                </p>
              ) : selected.size === 0 ? (
                <p className="text-sm text-mist">Select open plots on the grid. Legendary sectors glow gold, rare sectors blue.</p>
              ) : (
                <ul className="flex max-h-56 flex-col gap-1.5 overflow-auto pr-1" data-testid="claim-list">
                  {[...selected].map((i) => (
                    <li key={i} className="flex items-center justify-between rounded-xs border border-line bg-void/40 px-3 py-2 font-mono text-xs">
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-[2px]" style={{ background: ZONE_COLORS[zones?.[i] ?? 0] }} />
                        {plotLabel(encodeTokenId(planet.bodyId, i)).split(" · ")[1]}
                      </span>
                      <span className="flex items-center gap-2">
                        {formatPWSI(priceOf(i))}
                        <button onClick={() => toggle(i)} className="text-mist hover:text-si" aria-label="Remove">
                          <X className="size-3.5" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!PRE_LAUNCH && (
                <div className="grid gap-2 border-t border-line pt-4 font-mono text-xs">
                  <div className="flex justify-between"><span className="text-mist">Total</span><span className="text-ink">{formatPWSI(total)} PWSI</span></div>
                  <div className="flex justify-between"><span className="text-mist">Burned (10%) · to rewards (90%)</span><span className="text-solar">{formatPWSI(total / 10n)} · <span className="text-ion">{formatPWSI(total - total / 10n)}</span></span></div>
                  <div className="flex justify-between"><span className="text-mist">Your balance</span><span className={cn(balance !== undefined && balance < total ? "text-si" : "text-haze")}>{formatPWSI(balance)} PWSI</span></div>
                </div>
              )}
              {PRE_LAUNCH ? (
                <div className="flex flex-col gap-2">
                  <Button size="lg" disabled data-testid="claim-button">Claiming opens at launch</Button>
                  <FollowOnX size="sm" className="justify-center" />
                </div>
              ) : !isConnected ? (
                <WalletButton />
              ) : (
                <Button
                  size="lg"
                  data-testid="claim-button"
                  disabled={!isDeployed || selected.size === 0 || (balance !== undefined && balance < total)}
                  loading={pending !== null}
                  onClick={claim}
                >
                  {balance !== undefined && balance < total ? "Insufficient PWSI" : `Claim ${selected.size || ""} plot${selected.size === 1 ? "" : "s"}`}
                </Button>
              )}
              {isConnected && balance === 0n && getPwsiLink && (
                <Link href={getPwsiLink.href} className="text-center font-mono text-[11px] uppercase tracking-[0.14em] text-ion hover:underline">{getPwsiLink.label} →</Link>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader>
              <div className="flex items-center gap-2"><Rocket className="size-4 text-solar" /><h3 className="font-display text-lg font-bold tracking-tight">Missions</h3></div>
              <Badge tone={PRE_LAUNCH ? "legend" : "neutral"}>{PRE_LAUNCH ? "Opens at launch" : "10% burn · 90% rewards"}</Badge>
            </PanelHeader>
            <div className="flex flex-col gap-2 p-4">
              {MISSIONS.map((m) => (
                <button
                  key={m.id}
                  disabled={!isConnected || !isDeployed || pending !== null}
                  onClick={() => launchMission(m.id)}
                  className="group flex items-start justify-between gap-4 rounded-sm border border-line bg-void/30 p-3 text-left transition hover:border-solar/40 hover:bg-solar/[0.04] disabled:opacity-50"
                >
                  <div>
                    <div className="text-sm font-medium text-ink">{m.name}</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-mist">{m.blurb}</div>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-solar">{m.cost} PWSI</span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel tone="si" hud>
            <PanelHeader className="border-si/20">
              <div className="flex items-center gap-2"><ShieldAlert className="size-4 text-si" /><h3 className="font-display text-lg font-bold tracking-tight">SI activity</h3></div>
            </PanelHeader>
            <div className="flex flex-col gap-2 p-4">
              {attacks.length === 0 ? (
                <p className="text-sm text-mist">No attacks scheduled on {planet.name} right now. The SI is… thinking.</p>
              ) : (
                attacks.map((a) => (
                  <Link key={a.id} href={`/broadcasts#${a.id}`} className="rounded-sm border border-si/20 bg-si/[0.04] p-3 transition hover:border-si/50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{a.kind}</span>
                      <Badge tone={a.status === "active" ? "si" : "neutral"}>{a.status}</Badge>
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-mist">{a.sector} · severity {a.effectiveSeverity} · defense {a.defensePower}</div>
                  </Link>
                ))
              )}
            </div>
          </Panel>
        </div>
      </section>

      <nav className="mx-auto flex max-w-[1400px] items-center justify-between px-5 md:px-8">
        <Link href={`/planets/${prev.slug}`} className="group font-mono text-xs uppercase tracking-[0.14em] text-mist hover:text-ink">← {prev.name}</Link>
        <Link href={`/planets/${next.slug}`} className="group font-mono text-xs uppercase tracking-[0.14em] text-mist hover:text-ink">{next.name} →</Link>
      </nav>
    </div>
  );
}
