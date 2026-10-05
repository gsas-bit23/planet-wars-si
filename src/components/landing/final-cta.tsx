import Link from "next/link";
import { getPwsiLink } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";
import { FollowOnX, PRE_LAUNCH } from "@/components/launch/prelaunch";
import { XIcon } from "@/components/ui/x-icon";
import { X_HANDLE, X_URL } from "@/lib/site";

export function FinalCta() {
  return (
    <section className="relative mx-auto max-w-[1400px] px-5 md:px-8">
      <Reveal>
        <div className="hud relative overflow-hidden rounded-lg border border-line bg-[radial-gradient(120%_120%_at_0%_0%,#1a2333_0%,#07090f_55%)] px-8 py-20 md:px-16">
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-30 [mask-image:radial-gradient(circle_at_70%_50%,black,transparent_70%)]" />
          <div className="relative flex flex-col items-start gap-8 md:flex-row md:items-end md:justify-between">
            <h2 className="max-w-3xl font-display text-5xl font-bold leading-[0.9] tracking-[-0.04em] md:text-7xl">
              The SI is counting on you <span className="font-serif font-normal italic text-ion">not</span> showing up.
            </h2>
            <div className="flex flex-col items-start gap-4 md:items-end">
              {PRE_LAUNCH && (
                <p className="max-w-sm font-mono text-[11px] uppercase leading-relaxed tracking-[0.14em] text-solar md:text-right" data-testid="cta-launch">
                  <span className="mr-2 inline-block size-1.5 animate-pulse rounded-full bg-solar align-middle" />
                  Launching soon on Robinhood Chain · follow {X_HANDLE} for the token launch
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                {getPwsiLink ? (
                  <Button asChild size="lg"><Link href={getPwsiLink.href} {...(getPwsiLink.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{getPwsiLink.label}</Link></Button>
                ) : PRE_LAUNCH ? (
                  <Button asChild size="lg">
                    <a href={X_URL} target="_blank" rel="noopener noreferrer"><XIcon className="size-4" /> Follow {X_HANDLE}</a>
                  </Button>
                ) : (
                  <Button asChild size="lg"><Link href="/rewards">Daily rewards</Link></Button>
                )}
                <Button asChild size="lg" variant="outline"><Link href="/planets/earth">{PRE_LAUNCH ? "Explore Earth" : "Reclaim Earth"}</Link></Button>
                {!PRE_LAUNCH && <FollowOnX />}
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
