import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";

export function FinalCta() {
  return (
    <section className="relative mx-auto max-w-[1400px] px-5 md:px-8">
      <Reveal>
        <div className="hud relative overflow-hidden rounded-lg border border-line bg-[radial-gradient(120%_120%_at_0%_0%,#1a2333_0%,#07090f_55%)] px-8 py-20 md:px-16">
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-30 [mask-image:radial-gradient(circle_at_70%_50%,black,transparent_70%)]" />
          <div className="relative flex flex-col items-start gap-8 md:flex-row md:items-end md:justify-between">
            <h2 className="max-w-3xl font-display text-5xl font-extrabold leading-[0.9] tracking-[-0.04em] md:text-7xl">
              The SI is counting on you <span className="font-serif font-normal italic text-ion">not</span> showing up.
            </h2>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg"><Link href="/faucet">Get test PWSI</Link></Button>
              <Button asChild size="lg" variant="outline"><Link href="/planets/earth">Reclaim Earth</Link></Button>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
