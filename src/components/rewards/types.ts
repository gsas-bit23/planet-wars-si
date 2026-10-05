export type EpochView = {
  epochId: string;
  kind: "rewards" | "airdrop";
  day: string | null;
  root: string;
  total: string;
  leaderboardTotal: string;
  lotteryTotal: string;
  recipients: number;
  txHash: string | null;
  status: "pending" | "published" | "empty";
  meta: Record<string, unknown>;
  publishedAt: string | null;
};
export type RoundView = {
  round: number;
  day: string;
  status: "committed" | "closed" | "revealed" | "voided" | "skipped";
  seedHash: string | null;
  entrantsHash: string | null;
  targetBlock: number | null;
  randomness: string | null;
  txs: Record<string, string>;
  entrantCount: number;
  winnerCount: number;
};
export type RewardsResponse = {
  store: string;
  epochs: EpochView[];
  rounds: RoundView[];
  today: { entrants: number; entered: boolean | null };
  config: {
    lotteryActivityDays: number;
    lotteryWinners: number;
    holdHours: number;
    zoneWeights: number[];
    activity: Record<string, { points: number; cap: number }>;
  };
};
export type LeaderRow = {
  account: string;
  rank: number;
  score: number;
  tierBps: number;
  breakdown: { plots: number; holdScore: number; upgrades: number; shields: number; missions: number; defenses: number; activityScore: number };
};
export type LeaderboardResponse = { day: string; today: string; provisional: boolean; epoch: EpochView | null; rows: LeaderRow[] };
export type ClaimView = {
  epochId: string;
  account: string;
  amount: string;
  leaderboard: string;
  lottery: string;
  rank: number | null;
  proof: `0x${string}`[];
  kind: "rewards" | "airdrop";
  day: string | null;
  publishedAt: string | null;
};
