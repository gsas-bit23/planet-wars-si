import { defineChain, type Chain } from "viem";
import { baseSepolia, foundry, robinhoodTestnet } from "viem/chains";

/**
 * Robinhood Chain Testnet — verified against https://docs.robinhood.com/chain/connecting/
 * (chain ID 46630, public RPC, Blockscout explorer). viem ships the same definition; we
 * re-declare it so the RPC can be overridden (e.g. an Alchemy endpoint) via env.
 */
export const robinhoodChainTestnet = defineChain({
  ...robinhoodTestnet,
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || "https://rpc.testnet.chain.robinhood.com"],
    },
  },
});

/**
 * Robinhood Chain mainnet (chain 4663, Arbitrum Orbit). The game token on mainnet is launched
 * externally (pons launchpad), so this chain has no faucet. Nothing is deployed here yet.
 */
export const robinhoodChainMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_ROBINHOOD_MAINNET_RPC_URL || "https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

export const localAnvil = defineChain({
  ...foundry,
  name: "Anvil (local)",
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_LOCAL_RPC_URL || "http://127.0.0.1:8545"] } },
});

/** Fallback network, only used when NEXT_PUBLIC_CHAIN_ID=84532. */
export const baseSepoliaFallback = defineChain({
  ...baseSepolia,
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org"] } },
});

const CHAINS: Record<number, Chain> = {
  [robinhoodChainTestnet.id]: robinhoodChainTestnet,
  [robinhoodChainMainnet.id]: robinhoodChainMainnet,
  [localAnvil.id]: localAnvil,
  [baseSepoliaFallback.id]: baseSepoliaFallback,
};

export const TARGET_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || robinhoodChainTestnet.id);
export const targetChain: Chain = CHAINS[TARGET_CHAIN_ID] ?? robinhoodChainTestnet;

export const GAS_FAUCETS: Record<number, { label: string; url: string }[]> = {
  46630: [
    { label: "Robinhood Chain faucet", url: "https://faucet.testnet.chain.robinhood.com/" },
    { label: "Alchemy faucet", url: "https://www.alchemy.com/faucets/robinhood-testnet" },
  ],
  84532: [{ label: "Base Sepolia faucets", url: "https://docs.base.org/base-chain/tools/network-faucets" }],
  31337: [],
  4663: [],
};

export function explorerTx(hash: string) {
  const url = targetChain.blockExplorers?.default.url;
  return url ? `${url}/tx/${hash}` : undefined;
}

export function explorerAddress(addr: string) {
  const url = targetChain.blockExplorers?.default.url;
  return url ? `${url}/address/${addr}` : undefined;
}
