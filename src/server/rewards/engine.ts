import "server-only";
import { createHmac } from "node:crypto";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { createWalletClient, encodeAbiParameters, http, keccak256, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { addresses, dailyDrawAbi, rewardPoolAbi } from "@/lib/contracts";
import { targetChain, TARGET_CHAIN_ID } from "@/lib/chains";
import { publicClient } from "../chain";
import { serverEnv } from "../env";
import { getChainSnapshot, type Snapshot } from "../indexer";
import { store } from "../store";
import { canPublish, rewardsEnv } from "./config";
import {
  computeLeaderboard,
  dayLabel,
  dayStart,
  drawIndices,
  entrantsHash,
  leaderboardAmounts,
  lotteryAmounts,
  lotteryEntrants,
  utcDay,
  type ScoreRow,
} from "./scoring";
import { rewardsStore, type AllocationRecord, type EpochRecord, type LotteryRecord } from "./store";

export const AIRDROP_EPOCH_BASE = 1_000_000_000n;
const ROUND_STATUS = ["none", "committed", "closed", "revealed", "voided"] as const;
const LEAF_TYPES = ["uint256", "address", "uint256"];
const DEAD = "0x000000000000000000000000000000000000dead";

// ------------------------------------------------------------------ helpers

export function excludedAccounts(): Set<string> {
  const A = addresses;
  const s = new Set<string>(["0x0000000000000000000000000000000000000000", DEAD]);
  if (!A) return s;
  for (const a of [A.treasury, A.rewardPool, A.dailyDraw, A.territory, A.marketplace, A.ops, A.faucet, A.operator, A.deployer]) {
    if (a) s.add(a.toLowerCase());
  }
  // Extra protocol/test wallets (comma-separated), e.g. a market-maker or QA wallet.
  for (const a of (process.env.REWARDS_EXCLUDE || "").split(",")) if (/^0x[0-9a-fA-F]{40}$/.test(a.trim())) s.add(a.trim().toLowerCase());
  return s;
}

/** Seed for lottery round `round`: HMAC(LOTTERY_SECRET, chain:round). Revealed on-chain after the draw. */
export function seedFor(round: number): Hex {
  const mac = createHmac("sha256", rewardsEnv.lotterySecret).update(`pwsi-lottery:${TARGET_CHAIN_ID}:${round}`).digest("hex");
  return `0x${mac}`;
}
export const seedHashOf = (seed: Hex) => keccak256(encodeAbiParameters([{ type: "bytes32" }], [seed]));

function wallet() {
  const account = privateKeyToAccount(rewardsEnv.operatorKey as Hex);
  return createWalletClient({ account, chain: targetChain, transport: http(serverEnv.rpcUrl || undefined) });
}

async function send(fn: string, contract: "draw" | "pool", args: readonly unknown[]): Promise<Hex> {
  const A = addresses!;
  const w = wallet();
  const { request } = await publicClient.simulateContract({
    account: w.account,
    address: contract === "draw" ? A.dailyDraw : A.rewardPool,
    abi: (contract === "draw" ? dailyDrawAbi : rewardPoolAbi) as never,
    functionName: fn as never,
    args: args as never,
  });
  const hash = await w.writeContract(request as never);
  const rc = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (rc.status !== "success") throw new Error(`${fn} reverted (${hash})`);
  return hash;
}

async function roundOnChain(round: number) {
  const r = (await publicClient.readContract({
    address: addresses!.dailyDraw,
    abi: dailyDrawAbi,
    functionName: "roundInfo",
    args: [BigInt(round)],
  })) as { status: number; seedHash: Hex; entrantsRoot: Hex; entrantCount: number; targetBlock: bigint; randomness: Hex };
  return { ...r, status: ROUND_STATUS[Number(r.status)] ?? "none" };
}

async function drawBlock() {
  return (await publicClient.readContract({
    address: addresses!.dailyDraw,
    abi: dailyDrawAbi,
    functionName: "currentBlock",
  })) as bigint;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function defensesSince(fromDay: number) {
  return store.listDefensesSince(new Date(dayStart(fromDay) * 1000).toISOString()).catch(() => []);
}

// ------------------------------------------------------------------ live views

export async function leaderboardFor(day: number, snap?: Snapshot): Promise<ScoreRow[]> {
  const s = snap ?? (await getChainSnapshot());
  const defenses = await defensesSince(day);
  return computeLeaderboard(day, s.actions, s.transfers, s.plots, defenses, excludedAccounts());
}

export async function entrantsFor(day: number, snap?: Snapshot): Promise<string[]> {
  const s = snap ?? (await getChainSnapshot());
  const defenses = await defensesSince(day - rewardsEnv.activityDays + 1);
  return lotteryEntrants(day, rewardsEnv.activityDays, s.actions, defenses, excludedAccounts());
}

// ------------------------------------------------------------------ merkle

function buildTree(epochId: bigint, amounts: Map<string, bigint>) {
  const values = [...amounts.entries()]
    .filter(([, v]) => v > 0n)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([acct, v]) => [epochId.toString(), acct, v.toString()]);
  if (!values.length) return null;
  const tree = StandardMerkleTree.of(values, LEAF_TYPES);
  const proofs = new Map<string, string[]>();
  for (const [i, v] of tree.entries()) proofs.set(v[1] as string, tree.getProof(i));
  return { root: tree.root as Hex, proofs };
}

// ------------------------------------------------------------------ lottery lifecycle

type Log = string[];

async function ensureCommitted(round: number, log: Log) {
  const r = await roundOnChain(round);
  if (r.status !== "none") return;
  const hash = await send("commit", "draw", [BigInt(round), seedHashOf(seedFor(round))]);
  log.push(`commit round ${round} (${dayLabel(round)}): ${hash}`);
  await rewardsStore.saveRound({
    round,
    day: dayLabel(round),
    status: "committed",
    seedHash: seedHashOf(seedFor(round)),
    entrantsHash: null,
    entrants: [],
    winners: [],
    targetBlock: null,
    randomness: null,
    txs: { commit: hash },
  });
}

/** Drive round `day` to a terminal state; returns winners (empty when skipped/voided). */
async function resolveRound(day: number, snap: Snapshot, log: Log): Promise<LotteryRecord> {
  let rec: LotteryRecord = (await rewardsStore.getRound(day)) ?? {
    round: day,
    day: dayLabel(day),
    status: "skipped",
    seedHash: null,
    entrantsHash: null,
    entrants: [],
    winners: [],
    targetBlock: null,
    randomness: null,
    txs: {},
  };
  let r = await roundOnChain(day);
  if (r.status === "none") {
    rec = { ...rec, status: "skipped" };
    await rewardsStore.saveRound(rec);
    log.push(`round ${day}: never committed → no lottery (pot stays in the pool)`);
    return rec;
  }

  if (r.status === "committed") {
    const entrants = await entrantsFor(day, snap);
    const h = entrantsHash(entrants);
    const tx = await send("close", "draw", [BigInt(day), h, entrants.length]);
    rec = { ...rec, status: "closed", seedHash: r.seedHash, entrants, entrantsHash: h, txs: { ...rec.txs, close: tx } };
    await rewardsStore.saveRound(rec);
    log.push(`close round ${day}: ${entrants.length} entrants, ${tx}`);
    r = await roundOnChain(day);
  }

  if (r.status === "closed") {
    const target = r.targetBlock;
    rec.targetBlock = Number(target);
    if (!rec.entrants.length && r.entrantCount > 0) {
      // Store lost the list: recompute and make sure it matches the on-chain commitment.
      const entrants = await entrantsFor(day, snap);
      if (entrantsHash(entrants) !== r.entrantsRoot) throw new Error(`entrant list for round ${day} does not match`);
      rec.entrants = entrants;
      rec.entrantsHash = r.entrantsRoot;
    }
    let now = await drawBlock();
    for (let i = 0; i < 30 && now <= target; i++) {
      await sleep(1500);
      now = await drawBlock();
    }
    if (now > target + 256n) {
      const tx = await send("voidRound", "draw", [BigInt(day)]);
      rec = { ...rec, status: "voided", txs: { ...rec.txs, void: tx } };
      await rewardsStore.saveRound(rec);
      log.push(`round ${day}: reveal window missed → voided (${tx})`);
      return rec;
    }
    if (now <= target) throw new Error(`round ${day}: target block ${target} not reached yet`);
    const tx = await send("reveal", "draw", [BigInt(day), seedFor(day)]);
    rec.txs = { ...rec.txs, reveal: tx };
    log.push(`reveal round ${day}: ${tx}`);
    r = await roundOnChain(day);
  }

  if (r.status === "revealed") {
    if (!rec.entrants.length && r.entrantCount > 0) {
      const entrants = await entrantsFor(day, snap);
      if (entrantsHash(entrants) !== r.entrantsRoot) throw new Error(`entrant list for round ${day} does not match`);
      rec.entrants = entrants;
    }
    const idx = drawIndices(r.randomness, rec.entrants.length, Math.min(100, rec.entrants.length));
    rec = {
      ...rec,
      status: "revealed",
      seedHash: r.seedHash,
      entrantsHash: r.entrantsRoot,
      randomness: r.randomness,
      targetBlock: Number(r.targetBlock),
      winners: idx.map((i) => rec.entrants[i]!),
    };
    await rewardsStore.saveRound(rec);
    return rec;
  }

  rec = { ...rec, status: "voided" };
  await rewardsStore.saveRound(rec);
  return rec;
}

// ------------------------------------------------------------------ epochs

async function poolEpoch(epochId: bigint) {
  return (await publicClient.readContract({
    address: addresses!.rewardPool,
    abi: rewardPoolAbi,
    functionName: "epoch",
    args: [epochId],
  })) as { kind: number; root: Hex; total: bigint };
}

async function publishDay(day: number, snap: Snapshot, log: Log) {
  const epochId = BigInt(day);
  const existing = await poolEpoch(epochId);
  if (existing.kind !== 0) {
    const rec = await rewardsStore.getEpoch(epochId.toString());
    if (rec && rec.status !== "published" && rec.root.toLowerCase() === existing.root.toLowerCase()) {
      await rewardsStore.markEpochPublished(rec.epochId, rec.txHash ?? "");
    }
    return;
  }
  const prior = await rewardsStore.getEpoch(epochId.toString());
  if (prior?.status === "empty") return;

  const round = await resolveRound(day, snap, log);
  const rows = await leaderboardFor(day, snap);
  await rewardsStore.saveScores(
    dayLabel(day),
    rows.map((r) => ({ day: dayLabel(day), account: r.account, rank: r.rank, score: r.score, breakdown: r.breakdown })),
  );

  const cap = (await publicClient.readContract({ address: addresses!.rewardPool, abi: rewardPoolAbi, functionName: "epochCap" })) as bigint;
  const [lbCap, lotCap] = (await publicClient.readContract({
    address: addresses!.rewardPool,
    abi: rewardPoolAbi,
    functionName: "splitFor",
    args: [cap],
  })) as readonly [bigint, bigint];

  const lb = leaderboardAmounts(rows, lbCap);
  const lot = lotteryAmounts(round.status === "revealed" ? round.winners : [], lotCap);
  const lbTotal = [...lb.values()].reduce((a, b) => a + b, 0n);
  const lotTotal = [...lot.values()].reduce((a, b) => a + b, 0n);
  const merged = new Map<string, bigint>();
  for (const [a, v] of lb) merged.set(a, (merged.get(a) ?? 0n) + v);
  for (const [a, v] of lot) merged.set(a, (merged.get(a) ?? 0n) + v);
  const tree = buildTree(epochId, merged);

  const rankOf = new Map(rows.map((r) => [r.account, r.rank]));
  const meta = {
    epochCap: cap.toString(),
    leaderboardCap: lbCap.toString(),
    lotteryCap: lotCap.toString(),
    leaderboardRanked: rows.length,
    lotteryEntrants: round.entrants.length,
    lotteryWinners: round.winners.length,
    lotteryStatus: round.status,
  };
  const base: EpochRecord = {
    epochId: epochId.toString(),
    kind: "rewards",
    day: dayLabel(day),
    root: tree?.root ?? `0x${"0".repeat(64)}`,
    total: (lbTotal + lotTotal).toString(),
    leaderboardTotal: lbTotal.toString(),
    lotteryTotal: lotTotal.toString(),
    recipients: merged.size,
    txHash: null,
    status: tree ? "pending" : "empty",
    meta,
    publishedAt: null,
  };
  if (!tree) {
    await rewardsStore.saveEpoch(base, []);
    log.push(`epoch ${dayLabel(day)}: nothing to distribute (no ranked players / winners, or empty pool)`);
    return;
  }
  const allocs: AllocationRecord[] = [...merged.entries()].map(([account, amount]) => ({
    epochId: epochId.toString(),
    account,
    amount: amount.toString(),
    leaderboard: (lb.get(account) ?? 0n).toString(),
    lottery: (lot.get(account) ?? 0n).toString(),
    rank: rankOf.get(account) ?? null,
    proof: tree.proofs.get(account)!,
  }));
  await rewardsStore.saveEpoch(base, allocs);
  const uri = `${rewardsEnv.siteUrl}/api/rewards/epochs/${epochId}`;
  const tx = await send("publishRewards", "pool", [epochId, tree.root, lbTotal, lotTotal, merged.size, uri]);
  await rewardsStore.markEpochPublished(epochId.toString(), tx);
  log.push(`publish epoch ${dayLabel(day)}: ${merged.size} recipients, ${tx}`);
}

/**
 * Daily cron. Idempotent; safe to re-run. Order per closed day D:
 *   1. commit seeds for the next two rounds (must happen before a round starts)
 *   2. close round D with the entrant list → wait for the target L2 block → reveal (or void)
 *   3. compute the leaderboard for D, merge with lottery winners, build the Merkle tree,
 *      publish the root to RewardPool (caps enforced on-chain).
 */
export async function runRewardsTick(): Promise<{ ok: boolean; log: string[]; error?: string }> {
  const log: string[] = [];
  if (!addresses) return { ok: false, log, error: "contracts not deployed" };
  if (!canPublish()) return { ok: false, log, error: "OPERATOR_PRIVATE_KEY / LOTTERY_SECRET not configured" };
  try {
    const snap = await getChainSnapshot({ fresh: true });
    const today = utcDay(snap.latestTimestamp);
    for (const r of [today + 1, today + 2]) await ensureCommitted(r, log);
    for (const d of [today - 2, today - 1]) {
      try {
        await publishDay(d, snap, log);
      } catch (e) {
        log.push(`day ${dayLabel(d)} failed: ${(e as Error).message.split("\n")[0]}`);
      }
    }
    return { ok: true, log };
  } catch (e) {
    return { ok: false, log, error: (e as Error).message.split("\n")[0] };
  }
}

// ------------------------------------------------------------------ airdrop

export type AirdropEligibility = { account: string; amount: bigint; activeDays: number; claimedPlot: boolean; faucet: boolean };

export const AIRDROP_RULES = {
  base: 1_000n * 10n ** 18n,
  perActiveDay: 250n * 10n ** 18n,
  maxActiveDays: 8,
  plotBonus: 500n * 10n ** 18n,
};

/** Season eligibility: any qualifying game event or faucet use (this deployment), protocol accounts excluded. */
export function airdropEligibility(snap: Snapshot, excluded: Set<string>): AirdropEligibility[] {
  const days = new Map<string, Set<number>>();
  const plot = new Set<string>();
  for (const a of snap.actions) {
    if (!days.has(a.account)) days.set(a.account, new Set());
    days.get(a.account)!.add(utcDay(a.timestamp));
    if (a.kind === "claim") plot.add(a.account);
  }
  const all = new Set<string>([...days.keys(), ...snap.faucetUsers]);
  return [...all]
    .filter((a) => !excluded.has(a))
    .sort()
    .map((account) => {
      const activeDays = Math.min(days.get(account)?.size ?? 0, AIRDROP_RULES.maxActiveDays);
      const claimedPlot = plot.has(account);
      const amount =
        AIRDROP_RULES.base + BigInt(activeDays) * AIRDROP_RULES.perActiveDay + (claimedPlot ? AIRDROP_RULES.plotBonus : 0n);
      return { account, amount, activeDays, claimedPlot, faucet: snap.faucetUsers.includes(account) };
    });
}

export async function publishAirdrop(season: number) {
  const log: string[] = [];
  if (!addresses || !canPublish()) throw new Error("publishing not configured");
  const epochId = AIRDROP_EPOCH_BASE + BigInt(season);
  const onChain = await poolEpoch(epochId);
  if (onChain.kind !== 0) {
    // Published earlier (possibly by a request that timed out before updating the store).
    const rec = await rewardsStore.getEpoch(epochId.toString());
    if (rec && rec.status !== "published" && rec.root.toLowerCase() === onChain.root.toLowerCase()) {
      await rewardsStore.markEpochPublished(rec.epochId, rec.txHash ?? "");
      return { epochId: epochId.toString(), log: ["already on-chain; store marked published"] };
    }
    return { epochId: epochId.toString(), log: ["already published"] };
  }
  const snap = await getChainSnapshot({ fresh: true });
  const excluded = excludedAccounts();
  let list = airdropEligibility(snap, excluded);
  const available = (await publicClient.readContract({
    address: addresses.rewardPool,
    abi: rewardPoolAbi,
    functionName: "airdropAvailable",
  })) as bigint;
  const want = list.reduce((a, b) => a + b.amount, 0n);
  if (want > available) list = list.map((e) => ({ ...e, amount: (e.amount * available) / want }));
  const amounts = new Map(list.filter((e) => e.amount > 0n).map((e) => [e.account, e.amount]));
  const tree = buildTree(epochId, amounts);
  if (!tree) return { epochId: epochId.toString(), log: ["no eligible wallets"] };
  const total = [...amounts.values()].reduce((a, b) => a + b, 0n);
  const rec: EpochRecord = {
    epochId: epochId.toString(),
    kind: "airdrop",
    day: dayLabel(utcDay(snap.latestTimestamp)),
    root: tree.root,
    total: total.toString(),
    leaderboardTotal: "0",
    lotteryTotal: "0",
    recipients: amounts.size,
    txHash: null,
    status: "pending",
    meta: { season, snapshotBlock: snap.latest, rules: "1000 base + 250/active day (max 8) + 500 if claimed a plot" },
    publishedAt: null,
  };
  await rewardsStore.saveEpoch(
    rec,
    [...amounts.entries()].map(([account, amount]) => ({
      epochId: epochId.toString(),
      account,
      amount: amount.toString(),
      leaderboard: "0",
      lottery: "0",
      rank: null,
      proof: tree.proofs.get(account)!,
    })),
  );
  const uri = `${rewardsEnv.siteUrl}/api/rewards/epochs/${epochId}`;
  const tx = await send("publishAirdrop", "pool", [epochId, tree.root, total, amounts.size, uri]);
  await rewardsStore.markEpochPublished(epochId.toString(), tx);
  log.push(`airdrop season ${season}: ${amounts.size} wallets, ${tx}`);
  return { epochId: epochId.toString(), log };
}

export type { Address };
