import "server-only";
import { parseAbiItem, parseEventLogs, type Address } from "viem";
import { addresses } from "@/lib/contracts";
import { publicClient } from "./chain";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const MISSION = parseAbiItem(
  "event MissionLaunched(uint256 indexed missionId, address indexed player, uint256 indexed bodyId, uint8 missionType, uint256 burned)",
);
const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const CHUNK = 50_000n;
const TTL_MS = 15_000;

export type BurnEvent = {
  txHash: string;
  block: number;
  timestamp: number;
  from: string;
  amount: string;
  route: "marketplace-fee" | "sink" | "primary" | "buyback" | "direct";
};

type Snapshot = {
  at: number;
  latest: number;
  burns: BurnEvent[];
  missions: { bodyId: number; missionType: number; player: string; block: number }[];
};

const g = globalThis as unknown as { __pwsiIdx?: { snap?: Snapshot; inflight?: Promise<Snapshot> } };
const cache = (g.__pwsiIdx ??= {});

async function getLogsChunked<T>(fetcher: (from: bigint, to: bigint) => Promise<T[]>, from: bigint, to: bigint) {
  const out: T[] = [];
  for (let start = from; start <= to; start += CHUNK) {
    const end = start + CHUNK - 1n > to ? to : start + CHUNK - 1n;
    out.push(...(await fetcher(start, end)));
  }
  return out;
}

/**
 * Incremental: the first call scans from the deploy block, later calls only scan blocks after the
 * previous snapshot (fast L2s like Robinhood Chain produce several blocks per second).
 */
async function build(prev?: Snapshot): Promise<Snapshot> {
  if (!addresses) return { at: Date.now(), latest: 0, burns: [], missions: [] };
  const A = addresses;
  const latest = await publicClient.getBlockNumber();
  const from = prev ? BigInt(prev.latest) + 1n : BigInt(A.deployBlock);
  if (prev && from > latest) return { ...prev, at: Date.now() };

  const [burnLogs, opsLogs] = await Promise.all([
    getLogsChunked(
      (f, t) => publicClient.getLogs({ address: A.token, event: TRANSFER, args: { to: ZERO }, fromBlock: f, toBlock: t }),
      from,
      latest,
    ),
    getLogsChunked((f, t) => publicClient.getLogs({ address: A.ops, fromBlock: f, toBlock: t }), from, latest),
  ]);
  const missionLogs = parseEventLogs({ abi: [MISSION], logs: opsLogs, eventName: "MissionLaunched" });
  // Sink burns use burnFrom (so `from` is the player): classify by co-located PlanetOps events.
  const sinkTxs = new Set(opsLogs.map((l) => l.transactionHash));

  // Resolve block timestamps (deduplicated).
  const blocks = [...new Set(burnLogs.map((l) => l.blockNumber!))];
  const ts = new Map<bigint, number>();
  await Promise.all(
    blocks.slice(-400).map(async (b) => {
      const blk = await publicClient.getBlock({ blockNumber: b });
      ts.set(b, Number(blk.timestamp));
    }),
  );

  const routeOf = (from: string): BurnEvent["route"] => {
    const f = from.toLowerCase();
    if (f === A.treasury.toLowerCase()) return "marketplace-fee";
    if (f === A.territory.toLowerCase()) return "primary";
    return "direct";
  };

  const burns: BurnEvent[] = burnLogs.map((l) => ({
    txHash: l.transactionHash!,
    block: Number(l.blockNumber),
    timestamp: ts.get(l.blockNumber!) ?? 0,
    from: l.args.from!,
    amount: l.args.value!.toString(),
    route: sinkTxs.has(l.transactionHash!) ? "sink" : routeOf(l.args.from!),
  }));

  const missions = missionLogs.map((l) => ({
    bodyId: Number(l.args.bodyId),
    missionType: Number(l.args.missionType),
    player: l.args.player!,
    block: Number(l.blockNumber),
  }));

  return {
    at: Date.now(),
    latest: Number(latest),
    burns: prev ? [...prev.burns, ...burns] : burns,
    missions: prev ? [...prev.missions, ...missions] : missions,
  };
}

/** Cached on-chain snapshot of burns and missions (15s TTL, single-flight). */
export async function getChainSnapshot(): Promise<Snapshot> {
  if (cache.snap && Date.now() - cache.snap.at < TTL_MS) return cache.snap;
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
