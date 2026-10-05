import "server-only";
import { parseAbiItem, parseEventLogs, type Address, type Log } from "viem";
import { addresses } from "@/lib/contracts";
import { publicClient } from "./chain";
import { REVENUE_SOURCE_KEYS, type RevenueEvent, type RevenueSource } from "@/lib/revenue";

/**
 * In-process, incremental on-chain indexer for every event the game economy needs:
 * revenue splits (burned vs pooled), plot claims, NFT transfers (holding periods), upgrades,
 * shields, missions, marketplace sales, faucet use and reward claims.
 *
 * The first call scans from the deploy block; later calls only scan new blocks (15s TTL,
 * single-flight). Robinhood Chain RPC serves multi-million-block log ranges, so a cold start
 * stays fast for months of history.
 */

const EV = {
  revenue: parseAbiItem(
    "event RevenueProcessed(uint8 indexed source, address indexed from, uint256 amount, uint256 burned, uint256 pooled)",
  ),
  plotClaimed: parseAbiItem(
    "event PlotClaimed(address indexed player, uint256 indexed bodyId, uint256 indexed tokenId, uint8 zone, uint256 price)",
  ),
  transfer: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"),
  upgraded: parseAbiItem("event Upgraded(uint256 indexed tokenId, address indexed player, uint8 newLevel, uint256 cost)"),
  shield: parseAbiItem(
    "event ShieldBuilt(uint256 indexed tokenId, address indexed player, uint16 units, uint16 total, uint256 cost)",
  ),
  mission: parseAbiItem(
    "event MissionLaunched(uint256 indexed missionId, address indexed player, uint256 indexed bodyId, uint8 missionType, uint256 cost)",
  ),
  sale: parseAbiItem(
    "event Sale(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 fee)",
  ),
  faucet: parseAbiItem("event Claimed(address indexed account, uint256 amount, uint256 nextClaimAt)"),
  rewardClaimed: parseAbiItem("event Claimed(uint256 indexed epochId, address indexed account, uint256 amount)"),
};

const CHUNK = 5_000_000n;
const TTL_MS = 15_000;
const ZERO = "0x0000000000000000000000000000000000000000";

export { REVENUE_SOURCE_KEYS, type RevenueEvent, type RevenueSource };

/** A qualifying game action (lottery eligibility + leaderboard activity). */
export type GameAction = {
  kind: "claim" | "upgrade" | "shield" | "mission" | "trade";
  account: string;
  block: number;
  timestamp: number;
  tokenId?: string;
  level?: number;
  amount?: string;
  txHash: string;
};

export type NftTransfer = { tokenId: string; from: string; to: string; block: number; logIndex: number; timestamp: number };
export type PlotInfo = { bodyId: number; zone: number };

export type Snapshot = {
  at: number;
  latest: number;
  latestTimestamp: number;
  revenue: RevenueEvent[];
  actions: GameAction[];
  transfers: NftTransfer[];
  plots: Record<string, PlotInfo>;
  missions: { bodyId: number; missionType: number; player: string; block: number }[];
  faucetUsers: string[];
  rewardClaims: { epochId: string; account: string; amount: string; block: number }[];
};

type Cache = { snap?: Snapshot; inflight?: Promise<Snapshot>; ts: Map<bigint, number> };
const g = globalThis as unknown as { __pwsiIdx2?: Cache };
const cache: Cache = (g.__pwsiIdx2 ??= { ts: new Map() });

async function logsChunked(address: Address[], from: bigint, to: bigint): Promise<Log[]> {
  const out: Log[] = [];
  let step = CHUNK;
  for (let start = from; start <= to; ) {
    const end = start + step - 1n > to ? to : start + step - 1n;
    try {
      out.push(...(await publicClient.getLogs({ address, fromBlock: start, toBlock: end })));
      start = end + 1n;
    } catch (e) {
      if (step <= 10_000n) throw e;
      step /= 4n; // provider range limit: retry smaller
    }
  }
  return out;
}

async function timestamps(blocks: bigint[]) {
  const missing = [...new Set(blocks)].filter((b) => !cache.ts.has(b));
  for (let i = 0; i < missing.length; i += 25) {
    await Promise.all(
      missing.slice(i, i + 25).map(async (b) => {
        const blk = await publicClient.getBlock({ blockNumber: b });
        cache.ts.set(b, Number(blk.timestamp));
      }),
    );
  }
}

const lc = (a: string) => a.toLowerCase();

function empty(): Snapshot {
  return {
    at: Date.now(),
    latest: 0,
    latestTimestamp: Math.floor(Date.now() / 1000),
    revenue: [],
    actions: [],
    transfers: [],
    plots: {},
    missions: [],
    faucetUsers: [],
    rewardClaims: [],
  };
}

async function build(prev?: Snapshot): Promise<Snapshot> {
  if (!addresses) return empty();
  const A = addresses;
  const latestBlock = await publicClient.getBlock({ blockTag: "latest" });
  const latest = latestBlock.number;
  const from = prev ? BigInt(prev.latest) + 1n : BigInt(A.deployBlock);
  if (prev && from > latest) return { ...prev, at: Date.now() };

  const watched = [A.treasury, A.territory, A.ops, A.marketplace, A.rewardPool, ...(A.faucet ? [A.faucet] : [])];
  const logs = await logsChunked(watched as Address[], from, latest);
  const by = (addr: string) => logs.filter((l) => lc(l.address) === lc(addr));

  const revenueLogs = parseEventLogs({ abi: [EV.revenue], logs: by(A.treasury), eventName: "RevenueProcessed" });
  const terrLogs = by(A.territory);
  const claimLogs = parseEventLogs({ abi: [EV.plotClaimed], logs: terrLogs, eventName: "PlotClaimed" });
  const transferLogs = parseEventLogs({ abi: [EV.transfer], logs: terrLogs, eventName: "Transfer" });
  const opsLogs = by(A.ops);
  const upLogs = parseEventLogs({ abi: [EV.upgraded], logs: opsLogs, eventName: "Upgraded" });
  const shieldLogs = parseEventLogs({ abi: [EV.shield], logs: opsLogs, eventName: "ShieldBuilt" });
  const missionLogs = parseEventLogs({ abi: [EV.mission], logs: opsLogs, eventName: "MissionLaunched" });
  const saleLogs = parseEventLogs({ abi: [EV.sale], logs: by(A.marketplace), eventName: "Sale" });
  const faucetLogs = A.faucet ? parseEventLogs({ abi: [EV.faucet], logs: by(A.faucet), eventName: "Claimed" }) : [];
  const rewardLogs = parseEventLogs({ abi: [EV.rewardClaimed], logs: by(A.rewardPool), eventName: "Claimed" });

  await timestamps(
    [...revenueLogs, ...claimLogs, ...transferLogs, ...upLogs, ...shieldLogs, ...missionLogs, ...saleLogs].map(
      (l) => l.blockNumber!,
    ),
  );
  const ts = (b: bigint | null) => cache.ts.get(b!) ?? 0;

  const revenue: RevenueEvent[] = revenueLogs.map((l) => ({
    txHash: l.transactionHash!,
    block: Number(l.blockNumber),
    timestamp: ts(l.blockNumber),
    source: REVENUE_SOURCE_KEYS[Number(l.args.source)] ?? "other",
    from: lc(l.args.from!),
    amount: l.args.amount!.toString(),
    burned: l.args.burned!.toString(),
    pooled: l.args.pooled!.toString(),
  }));

  const plots: Record<string, PlotInfo> = { ...(prev?.plots ?? {}) };
  const actions: GameAction[] = [];
  for (const l of claimLogs) {
    plots[l.args.tokenId!.toString()] = { bodyId: Number(l.args.bodyId), zone: Number(l.args.zone) };
    actions.push({
      kind: "claim",
      account: lc(l.args.player!),
      block: Number(l.blockNumber),
      timestamp: ts(l.blockNumber),
      tokenId: l.args.tokenId!.toString(),
      amount: l.args.price!.toString(),
      txHash: l.transactionHash!,
    });
  }
  for (const l of upLogs) {
    actions.push({
      kind: "upgrade",
      account: lc(l.args.player!),
      block: Number(l.blockNumber),
      timestamp: ts(l.blockNumber),
      tokenId: l.args.tokenId!.toString(),
      level: Number(l.args.newLevel),
      amount: l.args.cost!.toString(),
      txHash: l.transactionHash!,
    });
  }
  for (const l of shieldLogs) {
    actions.push({
      kind: "shield",
      account: lc(l.args.player!),
      block: Number(l.blockNumber),
      timestamp: ts(l.blockNumber),
      tokenId: l.args.tokenId!.toString(),
      amount: l.args.cost!.toString(),
      txHash: l.transactionHash!,
    });
  }
  for (const l of missionLogs) {
    actions.push({
      kind: "mission",
      account: lc(l.args.player!),
      block: Number(l.blockNumber),
      timestamp: ts(l.blockNumber),
      amount: l.args.cost!.toString(),
      txHash: l.transactionHash!,
    });
  }
  for (const l of saleLogs) {
    for (const who of [l.args.buyer!, l.args.seller!]) {
      actions.push({
        kind: "trade",
        account: lc(who),
        block: Number(l.blockNumber),
        timestamp: ts(l.blockNumber),
        tokenId: l.args.tokenId!.toString(),
        amount: l.args.price!.toString(),
        txHash: l.transactionHash!,
      });
    }
  }
  actions.sort((a, b) => a.block - b.block);

  const transfers: NftTransfer[] = transferLogs.map((l) => ({
    tokenId: l.args.tokenId!.toString(),
    from: lc(l.args.from!),
    to: lc(l.args.to!),
    block: Number(l.blockNumber),
    logIndex: l.logIndex ?? 0,
    timestamp: ts(l.blockNumber),
  }));

  const missions = missionLogs.map((l) => ({
    bodyId: Number(l.args.bodyId),
    missionType: Number(l.args.missionType),
    player: l.args.player!,
    block: Number(l.blockNumber),
  }));

  const faucetUsers = new Set(prev?.faucetUsers ?? []);
  for (const l of faucetLogs) faucetUsers.add(lc(l.args.account!));

  return {
    at: Date.now(),
    latest: Number(latest),
    latestTimestamp: Number(latestBlock.timestamp),
    revenue: [...(prev?.revenue ?? []), ...revenue],
    actions: [...(prev?.actions ?? []), ...actions],
    transfers: [...(prev?.transfers ?? []), ...transfers],
    plots,
    missions: [...(prev?.missions ?? []), ...missions],
    faucetUsers: [...faucetUsers],
    rewardClaims: [
      ...(prev?.rewardClaims ?? []),
      ...rewardLogs.map((l) => ({
        epochId: l.args.epochId!.toString(),
        account: lc(l.args.account!),
        amount: l.args.amount!.toString(),
        block: Number(l.blockNumber),
      })),
    ],
  };
}

/** Cached on-chain snapshot (15s TTL, single-flight, incremental). */
export async function getChainSnapshot(opts: { fresh?: boolean } = {}): Promise<Snapshot> {
  if (!opts.fresh && cache.snap && Date.now() - cache.snap.at < TTL_MS) return cache.snap;
  cache.inflight ??= build(cache.snap)
    .then((s) => (cache.snap = s))
    .finally(() => (cache.inflight = undefined));
  try {
    return await cache.inflight;
  } catch (e) {
    if (cache.snap) return cache.snap;
    throw e;
  }
}

export function tallyMissions(missions: Snapshot["missions"]) {
  const t: Record<number, { recon: number; sabotage: number; liberation: number }> = {};
  for (const m of missions) {
    const e = (t[m.bodyId] ??= { recon: 0, sabotage: 0, liberation: 0 });
    if (m.missionType === 0) e.recon++;
    else if (m.missionType === 1) e.sabotage++;
    else e.liberation++;
  }
  return t;
}

export { ZERO };
