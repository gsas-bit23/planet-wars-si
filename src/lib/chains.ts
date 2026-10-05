import { defineChain, type Chain } from "viem";
import { NETWORK_CHAIN, NETWORK_GAS_FAUCETS, NETWORK_IS_TESTNET } from "./generated/network";

/**
 * The single network this build targets, selected at build time by scripts/select-network.mjs
 * from NEXT_PUBLIC_CHAIN_ID (default 4663 = Robinhood Chain mainnet; 46630 = testnet,
 * 31337 = local anvil). Only that chain's definition is bundled.
 * Network facts: https://docs.robinhood.com/chain/connecting/
 */
export const targetChain: Chain = defineChain(NETWORK_CHAIN);
export const TARGET_CHAIN_ID = targetChain.id;
/** Production network with real value. */
export const IS_MAINNET = !NETWORK_IS_TESTNET;
export const IS_TESTNET = NETWORK_IS_TESTNET;

/** Gas faucets for the target chain (empty on mainnet). */
export const GAS_FAUCETS: { label: string; url: string }[] = NETWORK_GAS_FAUCETS;

export function explorerTx(hash: string) {
  const url = targetChain.blockExplorers?.default.url;
  return url ? `${url}/tx/${hash}` : undefined;
}

export function explorerAddress(addr: string) {
  const url = targetChain.blockExplorers?.default.url;
  return url ? `${url}/address/${addr}` : undefined;
}
