"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PLANET_BY_ID, ZONE_LABELS, decodeTokenId, plotLabel } from "@/lib/planets";
import { useZoneSalt, zoneOfPlot } from "@/lib/hooks/use-game";
import { PlanetOrb } from "@/components/planet/planet-orb";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function useZoneOf(tokenId: bigint) {
  const { data: salt } = useZoneSalt();
  const { bodyId, plotIndex } = decodeTokenId(tokenId);
  const planet = PLANET_BY_ID[bodyId];
  return zoneOfPlot(salt, bodyId, plotIndex, planet?.cols ?? 50);
}

export function ZoneBadge({ zone }: { zone: number }) {
  return <Badge tone={zone === 2 ? "legend" : zone === 1 ? "rare" : "neutral"}>{ZONE_LABELS[zone]}</Badge>;
}

export function TerritoryCard({
  tokenId,
  level,
  shield,
  footer,
  className,
  highlight,
}: {
  tokenId: bigint;
  level?: number;
  shield?: number;
  footer?: ReactNode;
  className?: string;
  highlight?: boolean;
}) {
  const { bodyId, plotIndex } = decodeTokenId(tokenId);
  const planet = PLANET_BY_ID[bodyId];
  const zone = useZoneOf(tokenId);
  if (!planet) return null;
  const [, coord] = plotLabel(tokenId).split(" · ");
  return (
    <div
      data-testid="territory-card"
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-md border border-line bg-gradient-to-b from-hull to-abyss transition duration-300 hover:border-line-strong",
        zone === 2 && "border-legend/25",
        highlight && "ring-1 ring-ion/40",
        className,
      )}
    >
      <Link href={`/planets/${planet.slug}?plot=${plotIndex}`} className="relative flex items-center gap-4 p-4">
        <PlanetOrb planet={planet} size={52} speed={40} />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist">{planet.name} · {planet.zones[zone]}</div>
          <div className="mt-0.5 font-display text-xl font-bold tracking-tight">{coord}</div>
        </div>
        <ZoneBadge zone={zone} />
      </Link>
      {(level !== undefined || shield !== undefined) && (
        <div className="grid grid-cols-2 border-t border-line font-mono text-[11px]">
          <div className="border-r border-line px-4 py-2"><span className="text-mist">LVL </span><span className="text-ion">{level ?? 0}</span><span className="text-mist">/10</span></div>
          <div className="px-4 py-2"><span className="text-mist">SHIELD </span><span className="text-ink">{shield ?? 0}</span></div>
        </div>
      )}
      {footer && <div className="mt-auto border-t border-line p-4">{footer}</div>}
    </div>
  );
}
