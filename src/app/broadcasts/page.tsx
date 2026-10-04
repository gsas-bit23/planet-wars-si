import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { SiFeed } from "@/components/si/si-feed";

export const metadata: Metadata = { title: "SI Feed", description: "Daily SI broadcasts and live attacks on the planets." };

export default function BroadcastsPage() {
  return (
    <>
      <PageHeader
        eyebrow="SI//Overmind · daily transmissions"
        title={<>The SI is <span className="font-serif font-normal italic text-si">talking.</span></>}
        description="Every UTC day the SI publishes a broadcast and schedules attacks on three worlds. Each attack runs for 8 hours. Holders of territory on the target world can commit plots to the defense — level and shields add power. Out-power the attack and it's repelled; fail and the SI tightens its grip."
      />
      <SiFeed />
    </>
  );
}
