import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasSupabase, serverEnv } from "../env";

export type EpochRecord = {
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
export type AllocationRecord = {
  epochId: string;
  account: string;
  amount: string;
  leaderboard: string;
  lottery: string;
  rank: number | null;
  proof: string[];
};
export type ScoreRecord = { day: string; account: string; rank: number; score: number; breakdown: Record<string, number> };
export type LotteryRecord = {
  round: number;
  day: string;
  status: "committed" | "closed" | "revealed" | "voided" | "skipped";
  seedHash: string | null;
  entrantsHash: string | null;
  entrants: string[];
  winners: string[];
  targetBlock: number | null;
  randomness: string | null;
  txs: Record<string, string>;
};

export interface RewardsStore {
  kind: "supabase" | "memory";
  getEpoch(id: string): Promise<EpochRecord | null>;
  listEpochs(kind?: "rewards" | "airdrop", limit?: number): Promise<EpochRecord[]>;
  saveEpoch(e: EpochRecord, allocations: AllocationRecord[]): Promise<void>;
  markEpochPublished(id: string, txHash: string): Promise<void>;
  allocationsFor(account: string): Promise<AllocationRecord[]>;
  allocationsOf(epochId: string): Promise<AllocationRecord[]>;
  saveScores(day: string, rows: ScoreRecord[]): Promise<void>;
  getScores(day: string): Promise<ScoreRecord[]>;
  getRound(round: number): Promise<LotteryRecord | null>;
  listRounds(limit?: number): Promise<LotteryRecord[]>;
  saveRound(r: LotteryRecord): Promise<void>;
}

// ------------------------------------------------------------------ memory

type Mem = {
  epochs: Map<string, EpochRecord>;
  allocs: Map<string, AllocationRecord[]>;
  scores: Map<string, ScoreRecord[]>;
  rounds: Map<number, LotteryRecord>;
};
const g = globalThis as unknown as { __pwsiRewards?: Mem };
const mem: Mem = (g.__pwsiRewards ??= { epochs: new Map(), allocs: new Map(), scores: new Map(), rounds: new Map() });

const memoryStore: RewardsStore = {
  kind: "memory",
  async getEpoch(id) {
    return mem.epochs.get(id) ?? null;
  },
  async listEpochs(kind, limit = 60) {
    return [...mem.epochs.values()]
      .filter((e) => !kind || e.kind === kind)
      .sort((a, b) => (BigInt(b.epochId) > BigInt(a.epochId) ? 1 : -1))
      .slice(0, limit);
  },
  async saveEpoch(e, allocations) {
    mem.epochs.set(e.epochId, e);
    mem.allocs.set(e.epochId, allocations);
  },
  async markEpochPublished(id, txHash) {
    const e = mem.epochs.get(id);
    if (e) mem.epochs.set(id, { ...e, status: "published", txHash: txHash || e.txHash, publishedAt: new Date().toISOString() });
  },
  async allocationsFor(account) {
    const a = account.toLowerCase();
    return [...mem.allocs.values()].flat().filter((x) => x.account === a);
  },
  async allocationsOf(epochId) {
    return mem.allocs.get(epochId) ?? [];
  },
  async saveScores(day, rows) {
    mem.scores.set(day, rows);
  },
  async getScores(day) {
    return mem.scores.get(day) ?? [];
  },
  async getRound(round) {
    return mem.rounds.get(round) ?? null;
  },
  async listRounds(limit = 30) {
    return [...mem.rounds.values()].sort((a, b) => b.round - a.round).slice(0, limit);
  },
  async saveRound(r) {
    mem.rounds.set(r.round, r);
  },
};

// ------------------------------------------------------------------ supabase

let client: SupabaseClient | null = null;
const db = () =>
  (client ??= createClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));

type Row = Record<string, unknown>;
const toEpoch = (r: Row): EpochRecord => ({
  epochId: String(r.epoch_id),
  kind: r.kind as EpochRecord["kind"],
  day: (r.day as string) ?? null,
  root: r.root as string,
  total: String(r.total),
  leaderboardTotal: String(r.leaderboard_total),
  lotteryTotal: String(r.lottery_total),
  recipients: r.recipients as number,
  txHash: (r.tx_hash as string) ?? null,
  status: r.status as EpochRecord["status"],
  meta: (r.meta as Record<string, unknown>) ?? {},
  publishedAt: (r.published_at as string) ?? null,
});
const toAlloc = (r: Row): AllocationRecord => ({
  epochId: String(r.epoch_id),
  account: r.account as string,
  amount: String(r.amount),
  leaderboard: String(r.leaderboard),
  lottery: String(r.lottery),
  rank: (r.rank as number) ?? null,
  proof: r.proof as string[],
});
const toRound = (r: Row): LotteryRecord => ({
  round: r.round as number,
  day: r.day as string,
  status: r.status as LotteryRecord["status"],
  seedHash: (r.seed_hash as string) ?? null,
  entrantsHash: (r.entrants_hash as string) ?? null,
  entrants: (r.entrants as string[]) ?? [],
  winners: (r.winners as string[]) ?? [],
  targetBlock: r.target_block == null ? null : Number(r.target_block),
  randomness: (r.randomness as string) ?? null,
  txs: (r.txs as Record<string, string>) ?? {},
});

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

const supabaseStore: RewardsStore = {
  kind: "supabase",
  async getEpoch(id) {
    const rows = check(await db().from("reward_epochs").select("*").eq("epoch_id", id).limit(1));
    return rows?.[0] ? toEpoch(rows[0]) : null;
  },
  async listEpochs(kind, limit = 60) {
    let q = db().from("reward_epochs").select("*").order("epoch_id", { ascending: false }).limit(limit);
    if (kind) q = q.eq("kind", kind);
    return (check(await q) ?? []).map(toEpoch);
  },
  async saveEpoch(e, allocations) {
    check(
      await db().from("reward_epochs").upsert({
        epoch_id: e.epochId,
        kind: e.kind,
        day: e.day,
        root: e.root,
        total: e.total,
        leaderboard_total: e.leaderboardTotal,
        lottery_total: e.lotteryTotal,
        recipients: e.recipients,
        tx_hash: e.txHash,
        status: e.status,
        meta: e.meta,
        published_at: e.publishedAt,
      }),
    );
    check(await db().from("reward_allocations").delete().eq("epoch_id", e.epochId));
    for (let i = 0; i < allocations.length; i += 500) {
      check(
        await db()
          .from("reward_allocations")
          .insert(
            allocations.slice(i, i + 500).map((a) => ({
              epoch_id: a.epochId,
              account: a.account,
              amount: a.amount,
              leaderboard: a.leaderboard,
              lottery: a.lottery,
              rank: a.rank,
              proof: a.proof,
            })),
          ),
      );
    }
  },
  async markEpochPublished(id, txHash) {
    check(
      await db()
        .from("reward_epochs")
        .update({ status: "published", ...(txHash ? { tx_hash: txHash } : {}), published_at: new Date().toISOString() })
        .eq("epoch_id", id),
    );
  },
  async allocationsFor(account) {
    const rows = check(await db().from("reward_allocations").select("*").eq("account", account.toLowerCase()).limit(1000));
    return (rows ?? []).map(toAlloc);
  },
  async allocationsOf(epochId) {
    const rows = check(await db().from("reward_allocations").select("*").eq("epoch_id", epochId).limit(10000));
    return (rows ?? []).map(toAlloc);
  },
  async saveScores(day, rows) {
    check(await db().from("leaderboard_scores").delete().eq("day", day));
    if (rows.length)
      check(
        await db()
          .from("leaderboard_scores")
          .insert(rows.map((r) => ({ day, account: r.account, rank: r.rank, score: r.score, breakdown: r.breakdown }))),
      );
  },
  async getScores(day) {
    const rows = check(await db().from("leaderboard_scores").select("*").eq("day", day).order("rank").limit(100));
    return (rows ?? []).map((r: Row) => ({
      day: r.day as string,
      account: r.account as string,
      rank: r.rank as number,
      score: Number(r.score),
      breakdown: r.breakdown as Record<string, number>,
    }));
  },
  async getRound(round) {
    const rows = check(await db().from("lottery_rounds").select("*").eq("round", round).limit(1));
    return rows?.[0] ? toRound(rows[0]) : null;
  },
  async listRounds(limit = 30) {
    const rows = check(await db().from("lottery_rounds").select("*").order("round", { ascending: false }).limit(limit));
    return (rows ?? []).map(toRound);
  },
  async saveRound(r) {
    check(
      await db().from("lottery_rounds").upsert({
        round: r.round,
        day: r.day,
        status: r.status,
        seed_hash: r.seedHash,
        entrants_hash: r.entrantsHash,
        entrants: r.entrants,
        winners: r.winners,
        target_block: r.targetBlock,
        randomness: r.randomness,
        txs: r.txs,
        updated_at: new Date().toISOString(),
      }),
    );
  },
};

export const rewardsStore: RewardsStore = hasSupabase ? supabaseStore : memoryStore;
