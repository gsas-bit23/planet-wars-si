/** Client-safe mirror of RevenueTreasury source ids (0..7). */
export const REVENUE_SOURCE_KEYS = ["claim", "upgrade", "shield", "mission", "market-fee", "royalty", "buyback", "other"] as const;
export type RevenueSource = (typeof REVENUE_SOURCE_KEYS)[number];
export type RevenueEvent = {
  txHash: string;
  block: number;
  timestamp: number;
  source: RevenueSource;
  from: string;
  amount: string;
  burned: string;
  pooled: string;
};
