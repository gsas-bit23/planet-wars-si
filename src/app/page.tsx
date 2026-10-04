import { Hero } from "@/components/landing/hero";
import { SiMarquee } from "@/components/landing/si-marquee";
import { Narrative } from "@/components/landing/narrative";
import { WorldsStrip } from "@/components/landing/worlds-strip";
import { GameLoop } from "@/components/landing/game-loop";
import { Tokenomics } from "@/components/landing/tokenomics";
import { FinalCta } from "@/components/landing/final-cta";

export default function Home() {
  return (
    <>
      <Hero />
      <div className="relative z-10 -mt-px py-6">
        <SiMarquee />
      </div>
      <Narrative />
      <WorldsStrip />
      <GameLoop />
      <Tokenomics />
      <FinalCta />
    </>
  );
}
