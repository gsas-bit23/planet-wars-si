"use client";

import { useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { encodeAbiParameters, keccak256, type Address } from "viem";
import {
  addresses,
  faucetAbi,
  marketplaceAbi,
  opsAbi,
  rewardPoolAbi,
  territoryAbi,
  tokenAbi,
  treasuryAbi,
} from "@/lib/contracts";
import type { Zone } from "@/lib/planets";

const enabled = addresses !== null;
const A = addresses ?? ({} as NonNullable<typeof addresses>);

export function usePwsiBalance(account?: Address) {
  const { address } = useAccount();
  const who = account ?? address;
  return useReadContract({
    address: A.token,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: who ? [who] : undefined,
    query: { enabled: enabled && !!who, refetchInterval: 15_000 },
  });
}

export function useBodies() {
  return useReadContract({
    address: A.territory,
    abi: territoryAbi,
    functionName: "bodies",
    query: { enabled, refetchInterval: 20_000 },
  });
}

export function useClaimedBitmap(bodyId: number) {
  return useReadContract({
    address: A.territory,
    abi: territoryAbi,
    functionName: "claimedBitmap",
    args: [BigInt(bodyId)],
    query: { enabled, refetchInterval: 12_000 },
  });
}

export function useZoneSalt() {
  return useReadContract({
    address: A.territory,
    abi: territoryAbi,
    functionName: "zoneSalt",
    query: { enabled, staleTime: Infinity },
  });
}

/** Mirrors PlanetTerritory.zoneOf() off-chain so the whole grid can be coloured instantly. */
export function computeZones(salt: `0x${string}` | undefined, bodyId: number, supply: number, cols: number): Zone[] {
  const zones: Zone[] = new Array(supply).fill(0);
  const sectorCols = Math.ceil(cols / 5);
  const cache = new Map<number, Zone>();
  const s = salt ?? ("0x" + "00".repeat(32)) as `0x${string}`;
  for (let i = 0; i < supply; i++) {
    const sector = Math.floor(Math.floor(i / cols) / 5) * sectorCols + Math.floor((i % cols) / 5);
    let z = cache.get(sector);
    if (z === undefined) {
      const h = keccak256(
        encodeAbiParameters(
          [{ type: "bytes32" }, { type: "uint256" }, { type: "uint256" }],
          [s, BigInt(bodyId), BigInt(sector)],
        ),
      );
      const roll = Number(BigInt(h) % 100n);
      z = roll < 4 ? 2 : roll < 20 ? 1 : 0;
      cache.set(sector, z);
    }
    zones[i] = z;
  }
  return zones;
}

export function useZones(bodyId: number, supply: number, cols: number) {
  const { data: salt } = useZoneSalt();
  return useMemo(() => (salt ? computeZones(salt, bodyId, supply, cols) : null), [salt, bodyId, supply, cols]);
}

export function decodeBitmap(words: readonly bigint[] | undefined, supply: number): Uint8Array {
  const out = new Uint8Array(supply);
  if (!words) return out;
  for (let i = 0; i < supply; i++) {
    const w = words[i >> 8];
    if (w !== undefined && (w >> BigInt(i & 0xff)) & 1n) out[i] = 1;
  }
  return out;
}

export const REVENUE_SOURCES = ["Claims", "Upgrades", "Shields", "Missions", "Market fees", "Royalties", "Buybacks", "Other"] as const;

/** Protocol-wide stats. Burn figures come from OUR treasury (works with external tokens without burn counters). */
export function useProtocolStats() {
  return useReadContracts({
    allowFailure: false,
    contracts: [
      { address: A.token, abi: tokenAbi, functionName: "totalSupply" },
      { address: A.treasury, abi: treasuryAbi, functionName: "totalBurned" },
      { address: A.treasury, abi: treasuryAbi, functionName: "totalPooled" },
      { address: A.treasury, abi: treasuryAbi, functionName: "totalRevenue" },
      { address: A.treasury, abi: treasuryAbi, functionName: "revenueBreakdown" },
      { address: A.treasury, abi: treasuryAbi, functionName: "burnBps" },
      { address: A.rewardPool, abi: rewardPoolAbi, functionName: "rewardsAvailable" },
      { address: A.rewardPool, abi: rewardPoolAbi, functionName: "airdropAvailable" },
      { address: A.rewardPool, abi: rewardPoolAbi, functionName: "outstanding" },
      { address: A.rewardPool, abi: rewardPoolAbi, functionName: "totalClaimed" },
      { address: A.marketplace, abi: marketplaceAbi, functionName: "totalVolume" },
      { address: A.marketplace, abi: marketplaceAbi, functionName: "tradeCount" },
      { address: A.marketplace, abi: marketplaceAbi, functionName: "feeBps" },
      { address: A.territory, abi: territoryAbi, functionName: "totalSupply" },
      { address: A.rewardPool, abi: rewardPoolAbi, functionName: "epochCap" },
      { address: A.treasury, abi: treasuryAbi, functionName: "pendingBurnBps" },
      { address: A.treasury, abi: treasuryAbi, functionName: "pendingBurnBpsEta" },
    ],
    query: {
      enabled,
      refetchInterval: 15_000,
      select: (r) => ({
        supply: r[0] as bigint,
        burned: r[1] as bigint,
        pooled: r[2] as bigint,
        revenue: r[3] as bigint,
        bySource: (r[4] as readonly bigint[]).map((v) => v),
        burnBps: Number(r[5]),
        rewardsAvailable: r[6] as bigint,
        airdropAvailable: r[7] as bigint,
        outstanding: r[8] as bigint,
        totalClaimed: r[9] as bigint,
        volume: r[10] as bigint,
        trades: r[11] as bigint,
        feeBps: Number(r[12]),
        territoriesClaimed: r[13] as bigint,
        epochCap: r[14] as bigint,
        pendingBurnBps: Number(r[15]),
        pendingBurnBpsEta: Number(r[16]),
      }),
    },
  });
}

export function useFaucetClaims() {
  return useReadContract({
    address: A.faucet ?? undefined,
    abi: faucetAbi,
    functionName: "claimCount",
    query: { enabled: enabled && !!A.faucet, refetchInterval: 30_000 },
  });
}

export function useMyTerritories() {
  const { address } = useAccount();
  return useReadContract({
    address: A.territory,
    abi: territoryAbi,
    functionName: "tokensOfOwner",
    args: address ? [address] : undefined,
    query: { enabled: enabled && !!address, refetchInterval: 15_000 },
  });
}

export function useActiveListings() {
  return useReadContract({
    address: A.marketplace,
    abi: marketplaceAbi,
    functionName: "activeListings",
    args: [0n, 500n],
    query: { enabled, refetchInterval: 12_000 },
  });
}

export function useTerritoryStats(tokenIds: readonly bigint[] | undefined) {
  return useReadContracts({
    allowFailure: false,
    contracts: (tokenIds ?? []).map((id) => ({
      address: A.ops,
      abi: opsAbi,
      functionName: "stats" as const,
      args: [id] as const,
    })),
    query: { enabled: enabled && !!tokenIds?.length },
  });
}

/** Zone of a single plot (same maths as computeZones, one hash). */
export function zoneOfPlot(salt: `0x${string}` | undefined, bodyId: number, plotIndex: number, cols: number): Zone {
  if (!salt) return 0;
  const sectorCols = Math.ceil(cols / 5);
  const sector = Math.floor(Math.floor(plotIndex / cols) / 5) * sectorCols + Math.floor((plotIndex % cols) / 5);
  const h = keccak256(
    encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }, { type: "uint256" }], [salt, BigInt(bodyId), BigInt(sector)]),
  );
  const roll = Number(BigInt(h) % 100n);
  return roll < 4 ? 2 : roll < 20 ? 1 : 0;
}
