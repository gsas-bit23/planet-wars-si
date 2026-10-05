import { NextResponse, type NextRequest } from "next/server";
import { addresses } from "@/lib/contracts";

export const revalidate = 3600;

/**
 * Collection-level metadata (contractURI) in the format OpenSea reads:
 * https://docs.opensea.io/docs/contract-level-metadata. On-chain royalties are ERC-2981 (1% → treasury).
 */
export async function GET(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  return NextResponse.json({
    name: "Planet Wars SI — Territories",
    description:
      "Territory plots across the solar system, reclaimed from a hostile Super Intelligence. In-game items for Planet Wars SI: upgrade, shield and defend them in the daily SI campaign. Not an investment.",
    image: `${origin}/og.jpg`,
    banner_image: `${origin}/og.jpg`,
    featured_image: `${origin}/og.jpg`,
    external_link: origin,
    seller_fee_basis_points: 100,
    fee_recipient: addresses?.treasury ?? null,
  });
}
