import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PrelaunchSection } from "@/components/launch/prelaunch";
import { Portfolio } from "@/components/portfolio/portfolio";

export const metadata: Metadata = { title: "Portfolio", description: "Your territories, upgrades, shields and PWSI balance." };

export default function PortfolioPage() {
  return (
    <>
      <PageHeader eyebrow="Command · your holdings" title={<>Your <span className="font-serif font-normal italic text-ion">territory.</span></>} description="Every plot you hold, its level and shield strength. Upgrades and shields cost PWSI (10% burned, 90% to the reward pool) and persist with the territory if it changes hands." />
      <PrelaunchSection>{"Your plots, levels and shields will appear here once territories can be claimed. Claiming opens at launch, right after the PWSI token goes live on pons."}</PrelaunchSection>
      <Portfolio />
    </>
  );
}
