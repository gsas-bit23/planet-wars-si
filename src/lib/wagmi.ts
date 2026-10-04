"use client";

import { connectorsForWallets, type Wallet, type WalletList } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, createConnector, http } from "wagmi";
import { mock } from "wagmi/connectors";
import { targetChain } from "./chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";
const devWalletEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_WALLET === "true" && targetChain.id === 31337;

/** Anvil account #1 — a public, well-known LOCAL test account (never funded on a real network). */
const DEV_ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;

/**
 * Local-only burner wallet so the full flow can be exercised end-to-end (and by Playwright)
 * against anvil without a browser extension. Disabled unless NEXT_PUBLIC_ENABLE_DEV_WALLET=true
 * AND the target chain is 31337.
 */
const devWallet = (): Wallet => ({
  id: "pwsi-dev",
  name: "Anvil Dev Wallet",
  iconUrl: "/brand/dev-wallet.svg",
  iconBackground: "#0b0d12",
  installed: true,
  createConnector: (walletDetails) =>
    createConnector((config) => ({
      ...mock({ accounts: [DEV_ACCOUNT], features: { reconnect: true } })(config),
      ...walletDetails,
    })),
});

const groups: WalletList = [];
if (devWalletEnabled) groups.push({ groupName: "Local", wallets: [devWallet] });
groups.push({
  groupName: "Popular",
  wallets: projectId
    ? [metaMaskWallet, rabbyWallet, coinbaseWallet, rainbowWallet, walletConnectWallet, injectedWallet]
    : [injectedWallet, rabbyWallet, coinbaseWallet],
});

const connectors = connectorsForWallets(groups, {
  appName: "Planet Wars SI",
  // RainbowKit requires a string; WalletConnect-based wallets are only offered when it is set.
  projectId: projectId || "walletconnect-project-id-not-set",
});

export const wagmiConfig = createConfig({
  chains: [targetChain],
  connectors,
  transports: { [targetChain.id]: http() },
  ssr: true,
});

export const walletConnectConfigured = Boolean(projectId);
