#!/usr/bin/env node
// Read-only pre-launch checks for a deployed game suite. Sends no transactions.
// Usage:
//   CHAIN_ID=4663 [RPC_URL=...] [ADMIN_ADDRESS=0xSafe] [SITE_URL=https://pwsi.site] node scripts/preflight-mainnet.mjs
// Addresses come from contracts/deployments/<CHAIN_ID>.json (written by DeployMainnet.s.sol).
import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi, formatEther, getAddress } from "viem";

const chainId = Number(process.env.CHAIN_ID || 4663);
const rpc = process.env.RPC_URL || (chainId === 4663 ? "https://rpc.mainnet.chain.robinhood.com" : "https://rpc.testnet.chain.robinhood.com");
const site = (process.env.SITE_URL || "https://pwsi.site").replace(/\/$/, "");
const admin = process.env.ADMIN_ADDRESS ? getAddress(process.env.ADMIN_ADDRESS) : null;
const d = JSON.parse(readFileSync(new URL(`../contracts/deployments/${chainId}.json`, import.meta.url), "utf8"));
const c = createPublicClient({ transport: http(rpc) });
const ZERO = "0x0000000000000000000000000000000000000000";
const ADMIN_ROLE = `0x${"0".repeat(64)}`;

const abi = parseAbi([
  "function token() view returns (address)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function burnMode() view returns (uint8)",
  "function burnBps() view returns (uint16)",
  "function rewardPool() view returns (address)",
  "function hasRole(bytes32,address) view returns (bool)",
  "function PUBLISHER_ROLE() view returns (bytes32)",
  "function OPERATOR_ROLE() view returns (bytes32)",
  "function KEEPER_ROLE() view returns (bytes32)",
  "function owner() view returns (address)",
  "function pendingOwner() view returns (address)",
  "function contractURI() view returns (string)",
  "function royaltyInfo(uint256,uint256) view returns (address,uint256)",
  "function treasury() view returns (address)",
  "function useArbSys() view returns (bool)",
  "function bodyCount() view returns (uint256)",
  "function airdropAvailable() view returns (uint256)",
  "function burn(uint256)",
]);
const read = (address, functionName, args = []) => c.readContract({ address, abi, functionName, args });

let fails = 0;
const ok = (cond, msg, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}${detail ? `  (${detail})` : ""}`);
  if (!cond) fails++;
};
const warn = (msg) => console.log(`WARN  ${msg}`);

const rpcChain = await c.getChainId();
ok(rpcChain === chainId, `RPC chain id is ${chainId}`, `got ${rpcChain}`);
ok(d.chainId === chainId, "deployment file chain id");
ok(!d.faucet || d.faucet === ZERO || chainId !== 4663, "no faucet on mainnet");

for (const k of ["token", "treasury", "rewardPool", "dailyDraw", "territory", "marketplace", "ops"]) {
  const code = await c.getCode({ address: d[k] });
  ok(!!code && code !== "0x", `${k} has code`, d[k]);
}

const dec = await read(d.token, "decimals");
ok(dec === 18, "token has 18 decimals", String(dec));
console.log(`INFO  token symbol: ${await read(d.token, "symbol")}`);
for (const k of ["treasury", "rewardPool", "territory", "marketplace", "ops"]) {
  ok(getAddress(await read(d[k], "token")) === getAddress(d.token), `${k}.token() is the game token`);
}
ok(getAddress(await read(d.treasury, "rewardPool")) === getAddress(d.rewardPool), "treasury → rewardPool wiring");
for (const k of ["territory", "marketplace", "ops"]) {
  ok(getAddress(await read(d[k], "treasury")) === getAddress(d.treasury), `${k} pays the treasury`);
}
const mode = await read(d.treasury, "burnMode");
console.log(`INFO  burnMode: ${mode === 0 ? "burn() (totalSupply decreases)" : "transfer to 0x…dEaD"} · burnBps ${await read(d.treasury, "burnBps")}`);
if (mode === 0) {
  try {
    await c.simulateContract({ address: d.token, abi, functionName: "burn", args: [0n], account: d.treasury });
    ok(true, "token.burn() callable by the treasury");
  } catch (e) {
    ok(false, "token.burn() callable by the treasury", e.shortMessage);
  }
}
const [rcv, fee] = await read(d.territory, "royaltyInfo", [1n, 10_000n]);
ok(getAddress(rcv) === getAddress(d.treasury) && fee === 100n, "ERC-2981: 1% to the treasury", `${rcv} ${fee}`);
const curi = await read(d.territory, "contractURI");
ok(curi === `${site}/api/metadata/contract`, "contractURI points at the site", curi);
ok((await read(d.territory, "bodyCount")) >= 8n, "planets registered");
ok(await read(d.dailyDraw, "useArbSys"), "DailyDraw uses ArbSys (L2 block numbers)");

const op = d.operator;
ok(op && op !== ZERO && getAddress(op) !== getAddress(d.deployer), "operator set and separate from deployer", op);
ok(await read(d.rewardPool, "hasRole", [await read(d.rewardPool, "PUBLISHER_ROLE"), op]), "operator can publish reward roots");
ok(await read(d.dailyDraw, "hasRole", [await read(d.dailyDraw, "OPERATOR_ROLE"), op]), "operator runs the lottery");
const opBal = await c.getBalance({ address: op });
ok(opBal >= 5n * 10n ** 14n, "operator has ≥ 0.0005 ETH for gas", `${formatEther(opBal)} ETH`);

if (admin) {
  for (const k of ["treasury", "rewardPool", "dailyDraw"]) {
    ok(await read(d[k], "hasRole", [ADMIN_ROLE, admin]), `${k}: Safe is admin`);
    ok(!(await read(d[k], "hasRole", [ADMIN_ROLE, d.deployer])), `${k}: deployer is no longer admin`);
  }
  ok(!(await read(d.rewardPool, "hasRole", [await read(d.rewardPool, "PUBLISHER_ROLE"), d.deployer])), "deployer cannot publish");
  for (const k of ["territory", "marketplace", "ops"]) {
    const o = getAddress(await read(d[k], "owner"));
    const p = await read(d[k], "pendingOwner");
    ok(o === admin, `${k}: Safe is owner`, o === admin ? "" : p !== ZERO ? `pending ${p}: Safe must acceptOwnership()` : o);
  }
} else {
  warn("ADMIN_ADDRESS not given: admin is the deployer EOA. A Safe multisig is strongly recommended on mainnet.");
}
console.log(`INFO  airdrop allocation funded: ${formatEther(await read(d.rewardPool, "airdropAvailable"))}`);

try {
  const h = await (await fetch(`${site}/api/health`)).json();
  console.log(`INFO  ${site}/api/health → chain ${h.chain?.id}, store ${h.store}, faucet ${h.faucet}`);
  if (h.chain?.id !== chainId) warn(`site still serves chain ${h.chain?.id} (expected before the Vercel switch)`);
} catch {
  warn(`could not reach ${site}/api/health`);
}

console.log(fails ? `\n${fails} check(s) failed` : "\nall checks passed");
process.exit(fails ? 1 : 0);
