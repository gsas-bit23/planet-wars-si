import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Claim } from "@/components/rewards/claim";

export const metadata: Metadata = { title: "Claim rewards", description: "Claim leaderboard, lottery and airdrop PWSI with Merkle proofs." };

export default function ClaimPage() {
  return (
    <>
      <PageHeader
        eyebrow="Claims · Merkle distributor"
        title={<>Collect your <span className="font-serif font-normal italic text-solar">spoils.</span></>}
        description="Daily leaderboard prizes, lottery wins and airdrops, claimed directly from the RewardPool contract with a Merkle proof. You pay only gas."
      />
      <Claim />
    </>
  );
}
