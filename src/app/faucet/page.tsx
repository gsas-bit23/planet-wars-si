import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NETWORK_HAS_FAUCET } from "@/lib/generated/network";
// Generated per network: the testnet faucet page, or null (mainnet) so its copy is never bundled.
import FaucetPageBody from "@/lib/generated/faucet-body";

export const metadata: Metadata = NETWORK_HAS_FAUCET
  ? { title: "Faucet", description: "Claim free test PWSI every 24 hours." }
  : { title: "Not found" };

export default function FaucetPage() {
  // Mainnet has no faucet: the game token is launched externally (pons launchpad).
  if (!FaucetPageBody) notFound();
  return <FaucetPageBody />;
}
