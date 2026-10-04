"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { formatUnits } from "viem";
import { ArrowUpRight } from "lucide-react";
import { PLANETS } from "@/lib/planets";
import { useBodies } from "@/lib/hooks/use-game";
import { useControlMap, useSiFeed } from "@/lib/hooks/use-si-feed";
import { PlanetOrb } from "./planet-orb";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Sort = "order" | "price" | "supply" | "control";

export function PlanetsExplorer() {
  const { data: bodies } = useBodies();
  const control = useControlMap();
  const { data: feed } = useSiFeed();
  const [sort, setSort] = useState<Sort>("order");

  const rows = useMemo(() => {
    const list = PLANETS.map((p) => {
      const b = bodies?.[p.bodyId - 1];
      return {
        p,
        supply: b ? Number(b.supply) : p.supply,
        claimed: b ? Number(b.claimed) : 0,
        price: b ? Number(formatUnits(b.basePrice, 18)) : p.basePrice,
        control: control[p.bodyId] ?? p.siControl,
        underAttack: feed?.attacks.some((a) => a.bodyId === p.bodyId && a.status === "active") ?? false,
      };
    });
    if (sort === "price") list.sort((a, b) => a.price - b.price);
    if (sort === "supply") list.sort((a, b) => b.supply - a.supply);
    if (sort === "control") list.sort((a, b) => a.control - b.control);
    return list;
  }, [bodies, control, feed, sort]);

  return (
    <section className="mx-auto max-w-[1400px] px-5 py-12 md:px-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 rounded-sm border border-line bg-void/50 p-1">
          {(["order", "price", "supply", "control"] as Sort[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={cn(
                "rounded-xs px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition",
                sort === s ? "bg-white/[0.07] text-ink" : "text-mist hover:text-ink",
              )}
            >
              {s === "order" ? "Distance" : s === "control" ? "Weakest SI" : s}
            </button>
          ))}
        </div>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-mist">
          {rows.reduce((a, r) => a + r.claimed, 0).toLocaleString()} / {rows.reduce((a, r) => a + r.supply, 0).toLocaleString()} plots reclaimed
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {rows.map(({ p, supply, claimed, price, control: c, underAttack }, i) => (
          <motion.div
            key={p.slug}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
          >
            <Link
              href={`/planets/${p.slug}`}
              data-testid={`planet-card-${p.slug}`}
              className="group relative grid grid-cols-[auto_1fr] items-center gap-6 overflow-hidden rounded-md border border-line bg-gradient-to-br from-hull to-abyss p-6 transition duration-300 hover:border-line-strong md:gap-8 md:p-8"
            >
              <div
                className="pointer-events-none absolute -left-20 top-1/2 size-80 -translate-y-1/2 rounded-full opacity-0 blur-3xl transition duration-700 group-hover:opacity-40"
                style={{ background: p.glow }}
              />
              <PlanetOrb planet={p} size={p.ring ? 120 : 140} className="transition duration-700 group-hover:rotate-6 group-hover:scale-105" />
              <div className="relative min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-mist">0{p.bodyId} · {p.siCodename}</span>
                  {underAttack && <Badge tone="si">Under attack</Badge>}
                </div>
                <h2 className="mt-2 flex items-center gap-2 font-display text-4xl font-bold tracking-tight">
                  {p.name}
                  <ArrowUpRight className="size-5 text-mist opacity-0 transition group-hover:opacity-100" />
                </h2>
                <p className="mt-1 text-sm text-mist">{p.tagline}</p>
                <dl className="mt-5 grid grid-cols-3 gap-3 font-mono text-xs">
                  <div>
                    <dt className="text-mist">Plots</dt>
                    <dd className="mt-0.5 text-ink">{supply.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-mist">Claimed</dt>
                    <dd className="mt-0.5 text-ion">{claimed.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-mist">From</dt>
                    <dd className="mt-0.5 text-ink">{price} PWSI</dd>
                  </div>
                </dl>
                <div className="mt-4 flex items-center gap-3">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                    <div className="h-full bg-gradient-to-r from-si-deep to-si" style={{ width: `${c}%` }} />
                  </div>
                  <span className="font-mono text-[11px] text-si">{c.toFixed(1)}% SI</span>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 rounded-md border border-dashed border-line-strong p-6 text-sm text-mist md:grid-cols-3">
        {["The Moon", "Europa & Titan", "Ceres & Pluto"].map((n) => (
          <div key={n} className="flex items-center justify-between">
            <span className="font-display text-lg font-bold text-haze">{n}</span>
            <Badge>Coming soon</Badge>
          </div>
        ))}
      </div>
    </section>
  );
}
