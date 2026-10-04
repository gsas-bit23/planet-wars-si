import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { BurnDashboard } from "@/components/burn/burn-dashboard";

export const metadata: Metadata = { title: "Burn dashboard", description: "Every PWSI burned, indexed from on-chain events." };

export default function BurnPage() {
  return (
    <>
      <PageHeader eyebrow="Burn dashboard · indexed from chain" title={<>Gone <span className="font-serif font-normal italic text-solar">forever.</span></>} description="Every number here comes from the contracts: counters on the token, treasury, ops and territory contracts, plus Transfer-to-zero events indexed since deployment." />
      <BurnDashboard />
    </>
  );
}
