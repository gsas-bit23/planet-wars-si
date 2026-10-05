import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { notFound } from "next/navigation";
import { Faucet } from "@/components/faucet/faucet";
import { hasFaucet } from "@/lib/contracts";

export const metadata: Metadata = { title: "Faucet", description: "Claim free test PWSI every 24 hours." };

export default function FaucetPage() {
  // Mainnet has no faucet: the game token is launched externally (pons launchpad).
  if (!hasFaucet) notFound();
  return (
    <>
      <PageHeader eyebrow="Testnet faucet · rate-limited per wallet" title={<>Free <span className="font-serif font-normal italic text-ion">ammunition.</span></>} description="Claim test PWSI once every 24 hours per wallet. Test tokens have no monetary value. You'll also need a little testnet ETH for gas." />
      <Faucet />
    </>
  );
}
