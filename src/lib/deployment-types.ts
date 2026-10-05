import type { Address } from "viem";

export type Deployment = {
  chainId: number;
  deployBlock: number;
  operator: Address;
  deployer: Address;
  token: Address;
  /** null when the chain has no faucet (mainnet: token launched externally). */
  faucet: Address | null;
  treasury: Address;
  rewardPool: Address;
  dailyDraw: Address;
  territory: Address;
  marketplace: Address;
  ops: Address;
};
