import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PrelaunchSection } from "@/components/launch/prelaunch";
import { BurnDashboard } from "@/components/burn/burn-dashboard";

export const metadata: Metadata = { title: "Revenue & burn", description: "Every PWSI of game revenue: burned vs sent to the reward pool, indexed from on-chain events." };

export default function BurnPage() {
  return (
    <>
      <PageHeader eyebrow="Revenue & burn · indexed from chain" title={<>Burned <span className="font-serif font-normal italic text-solar">or</span> pooled.</>} description="Every PWSI the game earns is split on arrival: a share is burned forever, the rest funds the daily leaderboard and lottery. Every number here comes from the RevenueTreasury and RewardPool contracts and their events." />
      <PrelaunchSection>{"Revenue and burn counters start at zero when the game contracts go live. Every number on this page is read from the treasury contract, never estimated."}</PrelaunchSection>
      <BurnDashboard />
    </>
  );
}
