import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Leaderboard } from "@/components/rewards/leaderboard";

export const metadata: Metadata = { title: "Leaderboard", description: "Daily top-100 commanders, rewarded from the PWSI reward pool." };

export default function LeaderboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Daily leaderboard · resets 00:00 UTC"
        title={<>Hold the <span className="font-serif font-normal italic text-solar">line.</span></>}
        description="The top 100 commanders each UTC day share 70% of that day's reward budget. Score comes from plots held for 24 hours plus capped daily activity. Trading never scores."
      />
      <Leaderboard />
    </>
  );
}
