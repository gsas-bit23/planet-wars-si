import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PlanetsExplorer } from "@/components/planet/planets-explorer";

export const metadata: Metadata = { title: "Planets", description: "Explore the eight occupied worlds and their territory grids." };

export default function PlanetsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Planets explorer · 8 occupied worlds"
        title={
          <>
            Pick your <span className="font-serif font-normal italic text-ion">front.</span>
          </>
        }
        description="Every world has its own grid, supply and price. Smaller, denser worlds cost more per plot; gas giants offer thousands of cheaper plots. Moons and dwarf planets join later."
      />
      <PlanetsExplorer />
    </>
  );
}
