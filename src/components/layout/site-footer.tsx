import Link from "next/link";
import { Logo } from "./logo";
import { NAV } from "@/lib/nav";
import { addresses } from "@/lib/contracts";
import { IS_MAINNET, explorerAddress, targetChain } from "@/lib/chains";
import { shortAddress } from "@/lib/utils";
import { XIcon } from "@/components/ui/x-icon";
import { TokenCA } from "@/components/launch/token-ca";
import { X_HANDLE, X_URL } from "@/lib/site";

const CONTRACTS = [
  ["PWSI token", "token"],
  ["Territory NFT", "territory"],
  ["Marketplace", "marketplace"],
  ["Revenue treasury", "treasury"],
  ["Reward pool", "rewardPool"],
  ["Daily draw", "dailyDraw"],
  ["Planet ops", "ops"],
  ["Faucet", "faucet"],
] as const;

export function SiteFooter() {
  return (
    <footer className="relative mt-32 border-t border-line">
      <div className="mx-auto grid max-w-[1400px] gap-12 px-5 py-16 md:grid-cols-[1.4fr_1fr_1.2fr] md:px-8">
        <div className="flex flex-col gap-5">
          <Logo />
          <p className="max-w-sm text-sm leading-relaxed text-mist">
            A rogue superintelligence runs the solar system. Claim it back, one plot at a time. A game on{" "}
            {targetChain.name}.{" "}
            {IS_MAINNET
              ? "PWSI is a game token and territories are in-game items — not financial products. Rewards come only from game revenue in the pool and are never guaranteed."
              : "Testnet tokens have no monetary value — territories are in-game items, not financial products."}
          </p>
          <a
            href={X_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Planet Wars SI on X (${X_HANDLE})`}
            className="inline-flex w-fit items-center gap-2.5 rounded-full border border-line px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-haze transition hover:border-line-strong hover:text-ink"
          >
            <XIcon className="size-3.5" /> {X_HANDLE}
          </a>
          <TokenCA variant="compact" />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-haze transition hover:text-ink">
              {n.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-mist">Contracts · {targetChain.name}</span>
          {addresses ? (
            <ul className="grid gap-1.5 font-mono text-xs">
              {CONTRACTS.map(([label, key]) => {
                const a = addresses![key];
                if (!a) return null; // e.g. no faucet on mainnet
                const href = explorerAddress(a);
                return (
                  <li key={key} className="flex justify-between gap-4 border-b border-line/50 pb-1.5">
                    <span className="text-mist">{label}</span>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-haze hover:text-ion">
                        {shortAddress(a)}
                      </a>
                    ) : (
                      <span className="text-haze">{shortAddress(a)}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs leading-relaxed text-mist">
              {IS_MAINNET
                ? "Launching soon. Contract addresses are published here and on X the moment they go live. Verify them before you interact."
                : "Contracts not yet deployed on this network."}
            </p>
          )}
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1400px] flex-col justify-between gap-2 px-5 py-5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-mist md:flex-row md:px-8">
          <span>© {new Date().getFullYear()} Planet Wars SI · Working title</span>
          <span>
            Planet textures:{" "}
            <a className="underline decoration-line-strong underline-offset-4 hover:text-ink" href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer">
              Solar System Scope
            </a>{" "}
            (CC BY 4.0)
          </span>
        </div>
      </div>
    </footer>
  );
}
