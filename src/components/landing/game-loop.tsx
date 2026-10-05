import { Crosshair, Flame, Repeat, ShieldHalf } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { Reveal } from "./reveal";

const STEPS = [
  { icon: Crosshair, title: "Claim", body: "Pick plots on any planet's grid and claim them from the SI with PWSI. 10% of every claim is burned, 90% funds daily rewards." },
  { icon: ShieldHalf, title: "Fortify", body: "Upgrade territories (levels 1–10) and build shields. Upgrades and shields feed the same 10% burn / 90% reward split." },
  { icon: Repeat, title: "Trade", body: "List and buy territories peer-to-peer. A 1% fee on each sale goes to the treasury and is split instantly. Trades never score on the leaderboard." },
  { icon: Flame, title: "Defend", body: "The SI attacks worlds daily. Owners commit territories to defend; launch missions to weaken its grip." },
];

export function GameLoop() {
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-32 md:px-8">
      <Reveal>
        <SectionHeading index="03" eyebrow="The loop" title={<>Claim. Fortify. Trade. <span className="text-si">Defend.</span></>} />
      </Reveal>
      <div className="mt-14 grid gap-px overflow-hidden rounded-md border border-line bg-line md:grid-cols-4">
        {STEPS.map((s, i) => (
          <Reveal key={s.title} delay={i * 0.07}>
            <div className="group relative flex h-full flex-col gap-10 bg-abyss p-7 transition-colors hover:bg-hull">
              <div className="flex items-center justify-between">
                <s.icon className="size-6 text-ion" strokeWidth={1.4} />
                <span className="font-mono text-xs text-mist">0{i + 1}</span>
              </div>
              <div>
                <h3 className="font-display text-3xl font-bold tracking-tight">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-mist">{s.body}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
