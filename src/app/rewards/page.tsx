import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PrelaunchSection } from "@/components/launch/prelaunch";
import { Rewards } from "@/components/rewards/rewards";

export const metadata: Metadata = { title: "Rewards & lottery", description: "Daily PWSI lottery for active players and the reward pool, with verifiable draws." };

export default function RewardsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Rewards · daily lottery"
        title={<>Play, and the pool <span className="font-serif font-normal italic text-ion">plays back.</span></>}
        description="90% of all game revenue flows into the reward pool. Each day a capped share is paid out: 70% to the leaderboard, 30% to 100 random active players. Rewards depend on revenue and are never guaranteed."
      />
      <PrelaunchSection>{"The reward pool starts empty and fills from game revenue after launch (90% of every payment). The first daily lottery round is committed the day after the contracts go live."}</PrelaunchSection>
      <Rewards />
    </>
  );
}
