import type { Address } from "viem";
import { deployments, type Deployment } from "./generated/deployments";
import { TARGET_CHAIN_ID } from "./chains";

export * from "./generated/abis";

const env = (v: string | undefined) => (v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : undefined);

/**
 * Resolve contract addresses for the target chain. Env overrides (NEXT_PUBLIC_*_ADDRESS)
 * win over the committed deployment file so a fresh testnet deployment can be wired into
 * Vercel without a code change.
 */
function resolve(): Deployment | null {
  const base = deployments[TARGET_CHAIN_ID];
  const o = {
    token: env(process.env.NEXT_PUBLIC_TOKEN_ADDRESS),
    faucet: env(process.env.NEXT_PUBLIC_FAUCET_ADDRESS),
    treasury: env(process.env.NEXT_PUBLIC_TREASURY_ADDRESS),
    rewardPool: env(process.env.NEXT_PUBLIC_REWARD_POOL_ADDRESS),
    dailyDraw: env(process.env.NEXT_PUBLIC_DAILY_DRAW_ADDRESS),
    territory: env(process.env.NEXT_PUBLIC_TERRITORY_ADDRESS),
    marketplace: env(process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS),
    ops: env(process.env.NEXT_PUBLIC_OPS_ADDRESS),
  };
  const merged = {
    chainId: TARGET_CHAIN_ID,
    deployBlock: Number(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || base?.deployBlock || 0),
    operator: base?.operator ?? ("0x0000000000000000000000000000000000000000" as Address),
    deployer: base?.deployer ?? ("0x0000000000000000000000000000000000000000" as Address),
    token: o.token ?? base?.token,
    treasury: o.treasury ?? base?.treasury,
    rewardPool: o.rewardPool ?? base?.rewardPool,
    dailyDraw: o.dailyDraw ?? base?.dailyDraw,
    territory: o.territory ?? base?.territory,
    marketplace: o.marketplace ?? base?.marketplace,
    ops: o.ops ?? base?.ops,
  };
  if (Object.values(merged).some((v) => v === undefined)) return null;
  // The faucet is optional: mainnet has none (the game token is launched externally, e.g. on pons).
  const faucet = o.faucet ?? base?.faucet ?? null;
  return { ...merged, faucet } as Deployment;
}

export const addresses = resolve();
export const isDeployed = addresses !== null;
/** False on chains without a faucet (mainnet) — the faucet page and nav link are hidden. */
export const hasFaucet = !!addresses?.faucet;
export const faucetAddress = addresses?.faucet ?? undefined;

/**
 * Where players get PWSI: the faucet on testnet; on mainnet an optional external link
 * (NEXT_PUBLIC_TOKEN_BUY_URL, e.g. the token's pons launchpad page). null → hide the CTA.
 */
export const getPwsiLink: { href: string; label: string; external: boolean } | null = hasFaucet
  ? { href: "/faucet", label: "Claim free test PWSI", external: false }
  : process.env.NEXT_PUBLIC_TOKEN_BUY_URL
    ? { href: process.env.NEXT_PUBLIC_TOKEN_BUY_URL, label: "Get PWSI", external: true }
    : null;
