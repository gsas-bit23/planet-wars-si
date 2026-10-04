import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PLANETS, PLANET_BY_SLUG } from "@/lib/planets";
import { PlanetCommand } from "@/components/planet/planet-command";

export function generateStaticParams() {
  return PLANETS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(props: PageProps<"/planets/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const p = PLANET_BY_SLUG[slug];
  return p ? { title: p.name, description: `${p.tagline} ${p.lore}` } : {};
}

export default async function PlanetPage(props: PageProps<"/planets/[slug]">) {
  const { slug } = await props.params;
  const planet = PLANET_BY_SLUG[slug];
  if (!planet) notFound();
  return (
    <Suspense>
      <PlanetCommand slug={planet.slug} />
    </Suspense>
  );
}
