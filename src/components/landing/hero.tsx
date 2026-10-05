"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { getPwsiLink } from "@/lib/contracts";
import { motion } from "motion/react";
import { ArrowRight, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DecodeText } from "@/components/ui/decode-text";
import { useSiFeed } from "@/lib/hooks/use-si-feed";
import { LiveStatsBar } from "./live-stats";
import { FollowOnX } from "@/components/launch/prelaunch";
import { TokenCA } from "@/components/launch/token-ca";

const SolarSystem = dynamic(() => import("@/components/three/solar-system"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_55%,#2a1206_0%,#04050a_45%)]" />,
});

const ease = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  const { data } = useSiFeed();
  const today = data?.broadcasts[0];

  return (
    <section className="relative h-[100svh] min-h-[720px] w-full overflow-hidden">
      <SolarSystem className="absolute inset-0" />
      {/* Readability gradients */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-void via-void/55 to-transparent md:via-void/30" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-void to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-void/80 to-transparent" />
      {/* Scanline */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 animate-scan bg-gradient-to-b from-transparent via-si/[0.04] to-transparent" />

      <div className="pointer-events-none relative mx-auto flex h-full max-w-[1400px] flex-col justify-end px-5 pb-36 md:justify-center md:px-8 md:pb-20 md:pt-[var(--header-h)]">
        <div className="pointer-events-auto max-w-[880px]">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease }}
            className="mb-6 inline-flex items-center gap-2.5 rounded-xs border border-si/30 bg-si/[0.07] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-si"
          >
            <Radio className="size-3.5 animate-flicker" />
            <DecodeText text="Transmission intercepted · SI//Overmind" delay={200} />
          </motion.div>

          <h1 className="font-display text-[clamp(2.6rem,5.4vw,5.6rem)] font-bold leading-[0.9] tracking-[-0.04em]">
            <motion.span className="block" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease, delay: 0.1 }}>
              The solar system
            </motion.span>
            <motion.span className="block" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease, delay: 0.2 }}>
              has a new owner.
            </motion.span>
            <motion.span
              className="mt-2 block font-serif text-[0.62em] font-normal italic leading-none tracking-[-0.02em] text-ion"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, ease, delay: 0.35 }}
            >
              Take it back.
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.6 }}
            className="mt-7 max-w-[520px] text-pretty text-[16px] leading-relaxed text-haze"
          >
            A rogue superintelligence annexed all eight planets. Claim territory plots with $PWSI, fortify them, trade
            them, and hold the line when the SI strikes. Every token spent in the war is split: 10% burned forever, 90% to
            the daily leaderboard and lottery pool.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease, delay: 0.75 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Button asChild size="lg">
              <Link href="/planets">
                Choose a planet <ArrowRight className="transition group-hover/btn:translate-x-0.5" />
              </Link>
            </Button>
            {!getPwsiLink && <FollowOnX />}
            {getPwsiLink && (
              <Button asChild size="lg" variant="outline">
                <Link href={getPwsiLink.href} {...(getPwsiLink.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                  {getPwsiLink.label}
                </Link>
              </Button>
            )}
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.9 }} className="mt-6">
            <TokenCA />
          </motion.div>
        </div>
      </div>

      {today && (
        <motion.aside
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, ease, delay: 1.1 }}
          className="hud hud-si absolute right-8 top-[calc(var(--header-h)+40px)] hidden w-[340px] rounded-md border border-si/25 bg-[#120808]/70 p-5 backdrop-blur-xl xl:block"
        >
          <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.16em]">
            <span className="flex items-center gap-2 text-si">
              <span className="relative flex size-2">
                <span className="absolute inset-0 animate-pulse-ring rounded-full bg-si" />
                <span className="relative size-2 rounded-full bg-si" />
              </span>
              Live broadcast
            </span>
            <span className="text-mist">{today.day}</span>
          </div>
          <p className="mt-3 font-display text-lg font-bold leading-tight">{today.title}</p>
          <p className="mt-2 line-clamp-4 whitespace-pre-line font-mono text-[12px] leading-relaxed text-haze">{today.body}</p>
          <Link href="/broadcasts" className="mt-4 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink hover:text-si">
            Open SI feed <ArrowRight className="size-3.5" />
          </Link>
        </motion.aside>
      )}

      <div className="absolute inset-x-0 bottom-0">
        <LiveStatsBar />
      </div>
    </section>
  );
}
