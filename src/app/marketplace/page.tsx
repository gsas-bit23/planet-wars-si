import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PrelaunchSection } from "@/components/launch/prelaunch";
import { Marketplace } from "@/components/market/marketplace";

export const metadata: Metadata = { title: "Marketplace", description: "Trade territory plots peer-to-peer in PWSI. A 1% fee on every sale funds the burn and the reward pool." };

export default function MarketplacePage() {
  return (
    <>
      <PageHeader
        eyebrow="Territory marketplace · 1% protocol fee"
        title={<>Trade the <span className="font-serif font-normal italic text-solar">front line.</span></>}
        description="List territories you hold, buy plots other players have reclaimed. Sellers escrow their plot in the marketplace contract; a 1% protocol fee is sent to the RevenueTreasury and split (10% burned, 90% to the reward pool) in the same transaction."
      />
      <PrelaunchSection>{"The marketplace opens when the game contracts go live on Robinhood Chain. Listings, purchases and the 1% fee (10% burned, 90% to the reward pool) all settle on-chain from day one."}</PrelaunchSection>
      <Marketplace />
    </>
  );
}
