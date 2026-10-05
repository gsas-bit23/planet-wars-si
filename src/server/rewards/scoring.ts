/**
 * Pure reward maths (no I/O) — leaderboard scores, tier curve, lottery entrants and winner draw.
 * Everything here is deterministic so anyone can recompute a published epoch from chain data.
 */
import { encodeAbiParameters, encodePacked, keccak256 } from "viem";
import type { GameAction, NftTransfer, PlotInfo } from "../indexer";

export const DAY = 86_400;
export const dayStart = (day: number) => day * DAY;
export const dayEnd = (day: number) => (day + 1) * DAY; // exclusive
export const utcDay = (unixSeconds: number) => Math.floor(unixSeconds / DAY);
export const dayLabel = (day: number) => new Date(day * DAY * 1000).toISOString().slice(0, 10);
export const dayFromLabel = (label: string) => Math.floor(Date.parse(`${label}T00:00:00Z`) / 1000 / DAY);

/** Minimum continuous holding time before a plot counts towards the leaderboard. */
export const HOLD_SECONDS = 24 * 3600;
export const ZONE_WEIGHT = [1, 2.5, 6] as const; // common · rare · legendary
export const ACTIVITY = {
  upgrade: { points: 3, cap: 5 },
  shield: { points: 2, cap: 5 },
  mission: { points: 1, cap: 5 },
  defense: { points: 1, cap: 5 },
} as const;

export type ScoreBreakdown = {
  plots: number;
  holdScore: number;
  upgrades: number;
  shields: number;
  missions: number;
  defenses: number;
  activityScore: number;
};
export type ScoreRow = { account: string; score: number; rank: number; breakdown: ScoreBreakdown };

export type Defenses = { wallet: string; createdAt: string }[];

/** Owner at time `t` and the time they acquired it, per token (from ordered Transfer events). */
function holdingsAt(transfers: NftTransfer[], t: number) {
  const owner = new Map<string, { account: string; since: number }>();
  const sorted = [...transfers].sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
  for (const tr of sorted) {
    if (tr.timestamp >= t) break;
    owner.set(tr.tokenId, { account: tr.to, since: tr.timestamp });
  }
  return owner;
}

function levelsAt(actions: GameAction[], t: number) {
  const lvl = new Map<string, number>();
  for (const a of actions) {
    if (a.kind === "upgrade" && a.timestamp < t && a.tokenId) lvl.set(a.tokenId, a.level ?? 0);
  }
  return lvl;
}

/**
 * Daily leaderboard for UTC `day`.
 *  holdScore     = Σ over plots held continuously ≥ 24h at day end of zoneWeight × (1 + level/4)
 *  activityScore = capped points for upgrades, shields, missions and SI defenses during the day
 *  score         = holdScore + activityScore — only wallets with ≥1 qualifying action that day rank.
 * Marketplace trades score 0 and a purchase restarts the 24h holding clock, so wash/self trades
 * between wallets earn nothing (and pay the 1% fee).
 * `excluded` (protocol contracts, operator, marketplace escrow) never rank.
 */
export function computeLeaderboard(
  day: number,
  actions: GameAction[],
  transfers: NftTransfer[],
  plots: Record<string, PlotInfo>,
  defenses: Defenses,
  excluded: Set<string>,
  limit = 100,
): ScoreRow[] {
  const end = dayEnd(day);
  const start = dayStart(day);
  const owners = holdingsAt(transfers, end);
  const levels = levelsAt(actions, end);

  const rows = new Map<string, ScoreBreakdown>();
  const get = (a: string) => {
    let r = rows.get(a);
    if (!r) {
      r = { plots: 0, holdScore: 0, upgrades: 0, shields: 0, missions: 0, defenses: 0, activityScore: 0 };
      rows.set(a, r);
    }
    return r;
  };

  const active = new Set<string>();
  for (const a of actions) {
    if (a.timestamp < start || a.timestamp >= end) continue;
    active.add(a.account);
    const r = get(a.account);
    if (a.kind === "upgrade") r.upgrades++;
    else if (a.kind === "shield") r.shields++;
    else if (a.kind === "mission") r.missions++;
  }
  for (const d of defenses) {
    const t = Date.parse(d.createdAt) / 1000;
    if (t < start || t >= end) continue;
    active.add(d.wallet.toLowerCase());
    get(d.wallet.toLowerCase()).defenses++;
  }

  for (const [tokenId, o] of owners) {
    if (end - o.since < HOLD_SECONDS) continue;
    const info = plots[tokenId];
    if (!info) continue;
    const r = get(o.account);
    r.plots++;
    r.holdScore += (ZONE_WEIGHT[info.zone as 0 | 1 | 2] ?? 1) * (1 + (levels.get(tokenId) ?? 0) / 4);
  }

  const out: ScoreRow[] = [];
  for (const [account, r] of rows) {
    if (!active.has(account) || excluded.has(account)) continue;
    r.activityScore =
      Math.min(r.upgrades, ACTIVITY.upgrade.cap) * ACTIVITY.upgrade.points +
      Math.min(r.shields, ACTIVITY.shield.cap) * ACTIVITY.shield.points +
      Math.min(r.missions, ACTIVITY.mission.cap) * ACTIVITY.mission.points +
      Math.min(r.defenses, ACTIVITY.defense.cap) * ACTIVITY.defense.points;
    r.holdScore = Math.round(r.holdScore * 1000) / 1000;
    const score = Math.round((r.holdScore + r.activityScore) * 1000) / 1000;
    if (score <= 0) continue;
    out.push({ account, score, rank: 0, breakdown: r });
  }
  out.sort((a, b) => b.score - a.score || (a.account < b.account ? -1 : 1));
  return out.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Tier curve (share of the leaderboard pot, in basis points of 10_000) for ranks 1..100. Sums to 10_000. */
export function tierBps(rank: number): number {
  if (rank === 1) return 1000;
  if (rank === 2) return 600;
  if (rank === 3) return 400;
  if (rank <= 10) return 200; // 7 × 2%   = 14%
  if (rank <= 25) return 100; // 15 × 1%  = 15%
  if (rank <= 50) return 80; // 25 × 0.8% = 20%
  if (rank <= 100) return 62; // 50 × 0.62% = 31%
  return 0;
}

/** Leaderboard payouts: tier weights renormalised over the ranks actually present. */
export function leaderboardAmounts(rows: { account: string; rank: number }[], pot: bigint) {
  const weights = rows.map((r) => BigInt(tierBps(r.rank)));
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (sum === 0n || pot === 0n) return new Map<string, bigint>();
  const m = new Map<string, bigint>();
  rows.forEach((r, i) => {
    const amt = (pot * weights[i]!) / sum;
    if (amt > 0n) m.set(r.account, amt);
  });
  return m;
}

/**
 * Lottery entrants for round `day`: wallets with ≥1 qualifying event (plot claim, upgrade, shield,
 * mission, marketplace trade, SI defense) in the last `windowDays` UTC days ending with `day`.
 * Every qualifying on-chain action costs PWSI (10% burned), and defenses require holding a plot,
 * which is the anti-sybil floor. Sorted, lower-case, de-duplicated → deterministic indices.
 */
export function lotteryEntrants(
  day: number,
  windowDays: number,
  actions: GameAction[],
  defenses: Defenses,
  excluded: Set<string>,
): string[] {
  const from = dayStart(day - windowDays + 1);
  const to = dayEnd(day);
  const s = new Set<string>();
  for (const a of actions) if (a.timestamp >= from && a.timestamp < to) s.add(a.account);
  for (const d of defenses) {
    const t = Date.parse(d.createdAt) / 1000;
    if (t >= from && t < to) s.add(d.wallet.toLowerCase());
  }
  return [...s].filter((a) => !excluded.has(a)).sort();
}

/** Commitment to the entrant list stored on-chain by DailyDraw.close(). */
export const entrantsHash = (entrants: string[]) =>
  keccak256(encodePacked(["address[]"], [entrants as `0x${string}`[]]));

/** Exact TypeScript replica of DailyDraw.drawIndices (partial Fisher-Yates). */
export function drawIndices(randomness: `0x${string}`, n: number, k: number): number[] {
  if (k > n) k = n;
  const swapped = new Map<number, number>();
  const out: number[] = [];
  for (let i = 0; i < k; i++) {
    const h = BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [randomness, BigInt(i)])));
    const j = i + Number(h % BigInt(n - i));
    const vi = swapped.get(i) ?? i;
    const vj = swapped.get(j) ?? j;
    out.push(vj);
    swapped.set(j, vi);
  }
  return out;
}

export function lotteryAmounts(winners: string[], pot: bigint) {
  const m = new Map<string, bigint>();
  if (!winners.length || pot === 0n) return m;
  const each = pot / BigInt(winners.length);
  if (each === 0n) return m;
  for (const w of winners) m.set(w, (m.get(w) ?? 0n) + each);
  return m;
}
