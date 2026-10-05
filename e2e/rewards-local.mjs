// Local rewards pipeline test against anvil (chain 31337) + the dev server.
// Plays as three anvil accounts, travels through time, runs the cron, and claims via Merkle proofs.
// Usage: BASE=http://localhost:3005 RPC=http://127.0.0.1:8546 CRON=local-dev-cron node e2e/rewards-local.mjs
import { createPublicClient, createWalletClient, http, parseAbi, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3005";
const RPC = process.env.RPC || "http://127.0.0.1:8546";
const CRON = process.env.CRON || "local-dev-cron";
const dep = JSON.parse(readFileSync("contracts/deployments/31337.json", "utf8"));
const chain = { ...foundry, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });
// Public, well-known anvil test keys (#1, #3, #4). Never funded on a real network.
const KEYS = [
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
];
const players = KEYS.map((k) => createWalletClient({ account: privateKeyToAccount(k), chain, transport: http(RPC) }));
const erc20 = parseAbi(["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]);
const faucetAbi = parseAbi(["function claim()"]);
const terrAbi = parseAbi(["function claim(uint256 bodyId, uint256 plotIndex) returns (uint256)", "function isClaimed(uint256,uint256) view returns (bool)", "function tokensOfOwner(address) view returns (uint256[])", "function setApprovalForAll(address,bool)"]);
const opsAbi = parseAbi(["function upgrade(uint256 tokenId)", "function launchMission(uint256 bodyId, uint8 kind)", "function buildShield(uint256 tokenId, uint16 units)"]);
const poolAbi = parseAbi(["function claimMany(uint256[] epochIds, address account, uint256[] amounts, bytes32[][] proofs)", "function claimed(uint256,address) view returns (bool)", "function rewardsAvailable() view returns (uint256)", "function outstanding() view returns (uint256)"]);
const drawAbi = parseAbi(["function drawIndices(bytes32,uint256,uint256) view returns (uint256[])"]);

const ok = (c, m) => { if (!c) { console.log("FAIL", m); process.exitCode = 1; } else console.log("OK  ", m); };
const tx = async (w, req) => { const h = await w.writeContract({ ...req, account: w.account }); const r = await pub.waitForTransactionReceipt({ hash: h }); if (r.status !== "success") throw new Error("reverted " + req.functionName); return r; };
const rpc = (method, params = []) => fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then((r) => r.json());
const chainNow = async () => Number((await pub.getBlock()).timestamp);
const warpTo = async (t) => { await rpc("evm_setNextBlockTimestamp", [t]); await rpc("evm_mine"); };
const tick = () => fetch(`${BASE}/api/si/tick`, { headers: { authorization: `Bearer ${CRON}` } }).then((r) => r.json());
const DAY = 86400;

// Day 0: everyone gets PWSI and claims plots. RESUME_EPOCH=<day> skips straight to verification.
let now = await chainNow();
const RESUME = process.env.RESUME_EPOCH ? Number(process.env.RESUME_EPOCH) : null;
const d0 = RESUME ? RESUME - 1 : Math.floor(now / DAY);
let r;
if (!RESUME) {
console.log("chain day", d0, new Date(now * 1000).toISOString());
for (const [i, w] of players.entries()) {
  try { await tx(w, { address: dep.faucet, abi: faucetAbi, functionName: "claim" }); } catch { /* cooldown */ }
  for (const spender of [dep.territory, dep.ops, dep.marketplace]) await tx(w, { address: dep.token, abi: erc20, functionName: "approve", args: [spender, 2n ** 255n] });
  let claimed = 0;
  for (let p = 200 + i * 40; claimed < 2 + i && p < 400; p++) {
    if (await pub.readContract({ address: dep.territory, abi: terrAbi, functionName: "isClaimed", args: [1n, BigInt(p)] })) continue;
    await tx(w, { address: dep.territory, abi: terrAbi, functionName: "claim", args: [1n, BigInt(p)] });
    claimed++;
  }
}
ok(true, "day 0: faucet + plot claims for 3 players");

r = await tick();
console.log("tick #1:", JSON.stringify(r.rewards));
ok(r.rewards?.ok, "tick #1 ran (commits next rounds)");

// Day 1 (+26h): plots now held >24h; play.
await warpTo((d0 + 1) * DAY + 2 * 3600 + 7200);
await rpc("evm_setIntervalMining", [1]);
for (const [i, w] of players.entries()) {
  const ids = await pub.readContract({ address: dep.territory, abi: terrAbi, functionName: "tokensOfOwner", args: [w.account.address] });
  for (let u = 0; u <= i; u++) await tx(w, { address: dep.ops, abi: opsAbi, functionName: "upgrade", args: [ids[0]] });
  await tx(w, { address: dep.ops, abi: opsAbi, functionName: "launchMission", args: [3n, 0] });
}
ok(true, "day 1: upgrades + missions");

// Day 2 00:30 → tick closes/reveals round d0+1 and publishes epoch d0+1.
await warpTo((d0 + 2) * DAY + 1800);
r = await tick();
console.log("tick #2:", JSON.stringify(r.rewards, null, 1));
ok(r.rewards?.ok, "tick #2 ran");
}

const epoch = await fetch(`${BASE}/api/rewards/epochs/${d0 + 1}`).then((x) => x.json());
ok(epoch.epoch?.status === "published", `epoch ${d0 + 1} published with ${epoch.allocations?.length} recipients`);
const round = await fetch(`${BASE}/api/lottery/${d0 + 1}`).then((x) => x.json());
ok(round.status === "revealed", `lottery round revealed: ${round.entrants?.length} entrants, ${round.winners?.length} winners`);
const idx = await pub.readContract({ address: dep.dailyDraw, abi: drawAbi, functionName: "drawIndices", args: [round.randomness, BigInt(round.entrants.length), BigInt(Math.min(100, round.entrants.length))] });
ok(idx.map((i) => round.entrants[Number(i)]).join() === round.winners.join(), "winners match on-chain drawIndices");

const lb = await fetch(`${BASE}/api/leaderboard?day=${new Date((d0 + 1) * DAY * 1000).toISOString().slice(0, 10)}`).then((x) => x.json());
console.log("leaderboard:", lb.rows.map((x) => `${x.rank}:${x.account.slice(0, 6)}=${x.score}`).join(" "));
ok(lb.rows.length === 3 && !lb.provisional, "leaderboard has 3 ranked players and is final");

for (const w of players) {
  const a = w.account.address;
  const { claims } = await fetch(`${BASE}/api/claims?address=${a}`).then((x) => x.json());
  const open = claims.filter((c) => c.kind === "rewards");
  if (!open.length) { console.log("     no rewards for", a); continue; }
  const before = await pub.readContract({ address: dep.token, abi: erc20, functionName: "balanceOf", args: [a] });
  await tx(w, { address: dep.rewardPool, abi: poolAbi, functionName: "claimMany", args: [open.map((c) => BigInt(c.epochId)), a, open.map((c) => BigInt(c.amount)), open.map((c) => c.proof)] });
  const after = await pub.readContract({ address: dep.token, abi: erc20, functionName: "balanceOf", args: [a] });
  const want = open.reduce((s, c) => s + BigInt(c.amount), 0n);
  ok(after - before === want, `${a.slice(0, 8)} claimed ${formatUnits(want, 18)} PWSI`);
  let doubled = false;
  try { await tx(w, { address: dep.rewardPool, abi: poolAbi, functionName: "claimMany", args: [open.map((c) => BigInt(c.epochId)), a, open.map((c) => BigInt(c.amount)), open.map((c) => c.proof)] }); doubled = true; } catch { /* expected */ }
  ok(!doubled, "double claim rejected");
}
await rpc("evm_setIntervalMining", [0]);
await rpc("evm_setAutomine", [true]);
r = await tick();
ok(r.rewards?.ok, "tick #3 idempotent: " + JSON.stringify(r.rewards?.log));

const air = await fetch(`${BASE}/api/airdrop?address=${players[0].account.address}`).then((x) => x.json());
ok(air.eligible && air.status === "preview", `airdrop preview eligible: ${formatUnits(BigInt(air.preview.amount), 18)} PWSI`);
const pa = await fetch(`${BASE}/api/rewards/airdrop?season=1`, { method: "POST", headers: { authorization: `Bearer ${CRON}` } }).then((x) => x.json());
ok(pa.ok, "airdrop season 1 published: " + JSON.stringify(pa.log));
const air2 = await fetch(`${BASE}/api/airdrop?address=${players[1].account.address}`).then((x) => x.json());
ok(air2.status === "published" && air2.eligible, "airdrop allocation published for player 2");
const w1 = players[1];
const b0 = await pub.readContract({ address: dep.token, abi: erc20, functionName: "balanceOf", args: [w1.account.address] });
await tx(w1, { address: dep.rewardPool, abi: poolAbi, functionName: "claimMany", args: [[BigInt(air2.epochId)], w1.account.address, [BigInt(air2.allocation.amount)], [air2.allocation.proof]] });
const b1 = await pub.readContract({ address: dep.token, abi: erc20, functionName: "balanceOf", args: [w1.account.address] });
ok(b1 - b0 === BigInt(air2.allocation.amount), "airdrop claimed on-chain");
