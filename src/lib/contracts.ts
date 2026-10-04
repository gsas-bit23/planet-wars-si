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
    territory: env(process.env.NEXT_PUBLIC_TERRITORY_ADDRESS),
    marketplace: env(process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS),
    ops: env(process.env.NEXT_PUBLIC_OPS_ADDRESS),
  };
  const merged = {
    chainId: TARGET_CHAIN_ID,
    deployBlock: Number(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || base?.deployBlock || 0),
    token: o.token ?? base?.token,
    faucet: o.faucet ?? base?.faucet,
    treasury: o.treasury ?? base?.treasury,
    territory: o.territory ?? base?.territory,
    marketplace: o.marketplace ?? base?.marketplace,
    ops: o.ops ?? base?.ops,
  };
  if (Object.values(merged).some((v) => v === undefined)) return null;
  return merged as Deployment;
}

export const addresses = resolve();
export const isDeployed = addresses !== null;
