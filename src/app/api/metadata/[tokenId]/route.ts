import { NextResponse, type NextRequest } from "next/server";
import { addresses, opsAbi, territoryAbi } from "@/lib/contracts";
import { PLANET_BY_ID, ZONE_LABELS, decodeTokenId, plotLabel } from "@/lib/planets";
import { publicClient } from "@/server/chain";

export const revalidate = 60;

/** ERC-721 metadata for PlanetTerritory (tokenURI = METADATA_BASE_URI + tokenId). */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/metadata/[tokenId]">) {
  const { tokenId } = await ctx.params;
  if (!/^\d{1,20}$/.test(tokenId)) return NextResponse.json({ error: "bad token id" }, { status: 400 });
  const id = BigInt(tokenId);
  const { bodyId, plotIndex } = decodeTokenId(id);
  const planet = PLANET_BY_ID[bodyId];
  if (!planet) return NextResponse.json({ error: "unknown body" }, { status: 404 });

  let zone = 0;
  let level = 0;
  let shield = 0;
  if (addresses) {
    try {
      const [z, s] = await Promise.all([
        publicClient.readContract({ address: addresses.territory, abi: territoryAbi, functionName: "zoneOf", args: [BigInt(bodyId), BigInt(plotIndex)] }),
        publicClient.readContract({ address: addresses.ops, abi: opsAbi, functionName: "stats", args: [id] }),
      ]);
      zone = Number(z);
      level = Number(s[0]);
      shield = Number(s[1]);
    } catch {
      /* fall back to defaults */
    }
  }
  const origin = req.nextUrl.origin;
  return NextResponse.json({
    name: plotLabel(id),
    description: `A territory plot on ${planet.name}, reclaimed from the SI. In-game item for Planet Wars SI.`,
    image: `${origin}/textures/${planet.slug === "venus" ? "venus_atmosphere" : planet.slug === "earth" ? "earth_daymap" : planet.slug}_1k.webp`,
    external_url: `${origin}/planets/${planet.slug}?plot=${plotIndex}`,
    attributes: [
      { trait_type: "World", value: planet.name },
      { trait_type: "Zone", value: ZONE_LABELS[zone] },
      { trait_type: "Sector", value: planet.zones[zone] },
      { trait_type: "Plot", value: plotIndex, display_type: "number" },
      { trait_type: "Level", value: level, display_type: "number" },
      { trait_type: "Shield", value: shield, display_type: "number" },
    ],
  });
}
