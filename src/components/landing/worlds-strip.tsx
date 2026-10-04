"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PLANETS } from "@/lib/planets";
import { PlanetOrb } from "@/components/planet/planet-orb";
import { SectionHeading } from "@/components/ui/section-heading";
import { useControlMap } from "@/lib/hooks/use-si-feed";
import { Reveal } from "./reveal";

export function WorldsStrip() {
  const control = useControlMap();
  return (
    <section className="relative border-y border-line bg-abyss/60 py-28">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-12 px-5 md:px-8">
        <Reveal className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <SectionHeading
            index="02"
            eyebrow="Eight fronts"
            title="Every world, divided."
            description="Each planet is split into a grid of territory plots — 600 on Mercury, 5,000 on Jupiter. 5×5 sectors roll Common, Rare or Legendary zones that price at 1×, 2.5× and 10×."
          />
          <Link href="/planets" className="group inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-haze hover:text-ink">
            All planets <ArrowUpRight className="size-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </Reveal>
        <div className="-mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-4 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
          {PLANETS.map((p, i) => {
            const c = control[p.bodyId] ?? p.siControl;
            return (
              <Reveal key={p.slug} delay={(i % 4) * 0.06} className="min-w-[260px] snap-start md:min-w-0">
                <Link
                  href={`/planets/${p.slug}`}
                  className="group relative flex h-full flex-col overflow-hidden rounded-md border border-line bg-hull/60 p-5 transition duration-300 hover:-translate-y-1 hover:border-line-strong"
                >
                  <div className="flex items-start justify-between">
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-mist">0{p.bodyId} · {p.siCodename}</span>
                    <ArrowUpRight className="size-4 text-mist transition group-hover:text-ink" />
                  </div>
                  <div className="my-6 flex justify-center">
                    <PlanetOrb planet={p} size={p.ring ? 104 : 120} className="transition duration-500 group-hover:scale-105" />
                  </div>
                  <h3 className="font-display text-2xl font-bold tracking-tight">{p.name}</h3>
                  <p className="mt-0.5 text-sm text-mist">{p.tagline}</p>
                  <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 font-mono text-xs">
                    <div>
                      <div className="text-mist">Plots</div>
                      <div className="text-ink">{p.supply.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-mist">From</div>
                      <div className="text-ink">{p.basePrice} PWSI</div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between font-mono text-[10.5px] uppercase tracking-[0.14em]">
                      <span className="text-mist">SI control</span>
                      <span className="text-si">{c.toFixed(1)}%</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-line">
                      <div className="h-full rounded-full bg-gradient-to-r from-si-deep to-si" style={{ width: `${c}%` }} />
                    </div>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
