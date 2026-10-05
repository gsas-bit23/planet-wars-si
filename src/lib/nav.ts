import { hasFaucet } from "./contracts";

const ALL = [
  { href: "/planets", label: "Planets" },
  { href: "/marketplace", label: "Market" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/rewards", label: "Rewards" },
  { href: "/claim", label: "Claim" },
  { href: "/broadcasts", label: "SI Feed" },
  { href: "/burn", label: "Revenue" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/faucet", label: "Faucet", faucet: true },
];

/** Faucet link only appears on chains that have a faucet (testnet). */
export const NAV = ALL.filter((i) => !i.faucet || hasFaucet).map(({ href, label }) => ({ href, label }));
