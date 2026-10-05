"use client";

import { useEffect, useState } from "react";
import { useAccount, useBalance, useBlock, useReadContracts } from "wagmi";
import type { Abi } from "viem";
import { Droplets, ExternalLink, Fuel } from "lucide-react";
import { faucetAbi, faucetAddress, isDeployed } from "@/lib/contracts";
import { GAS_FAUCETS, targetChain } from "@/lib/chains";
import { usePwsiBalance } from "@/lib/hooks/use-game";
import { useTx } from "@/lib/hooks/use-tx";
import { formatCountdown, formatPWSI } from "@/lib/format";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { WalletButton } from "@/components/layout/connect-button";

export function Faucet() {
  const { address, isConnected } = useAccount();
  const { data: eth } = useBalance({ address, query: { enabled: !!address } });
  const { data: balance } = usePwsiBalance();
  const { send, pending } = useTx();
  const [wall, setWall] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setWall(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // The cooldown is enforced against block.timestamp, so measure it on chain time (local
  // chains can drift far from the wall clock after evm_increaseTime / warp).
  const { data: block, dataUpdatedAt } = useBlock({ query: { refetchInterval: 15_000 } });
  const skew = block ? Number(block.timestamp) * 1000 - dataUpdatedAt : 0;
  const now = wall + skew;

  const { data } = useReadContracts({
    allowFailure: false,
    contracts: faucetAddress
      ? [
          { address: faucetAddress, abi: faucetAbi, functionName: "dripAmount" },
          { address: faucetAddress, abi: faucetAbi, functionName: "cooldown" },
          { address: faucetAddress, abi: faucetAbi, functionName: "nextClaimAt", args: [address ?? "0x0000000000000000000000000000000000000000"] },
          { address: faucetAddress, abi: faucetAbi, functionName: "totalDripped" },
          { address: faucetAddress, abi: faucetAbi, functionName: "claimCount" },
        ]
      : [],
    query: { enabled: !!faucetAddress, refetchInterval: 15_000 },
  });
  const [drip, cooldown, nextAt, totalDripped, claims] = (data ?? []) as [bigint?, bigint?, bigint?, bigint?, bigint?];
  const nextMs = nextAt ? Number(nextAt) * 1000 : 0;
  const ready = isConnected && nextMs <= now;
  const needsGas = eth !== undefined && eth.value === 0n;
  const gasFaucets = GAS_FAUCETS;

  async function claim() {
    if (!faucetAddress) return;
    await send(`Claim ${formatPWSI(drip)} PWSI`, { address: faucetAddress, abi: faucetAbi as Abi, functionName: "claim" });
  }

  const progress = nextMs > now && cooldown ? 1 - (nextMs - now) / (Number(cooldown) * 1000) : 1;

  return (
    <section className="mx-auto grid max-w-[1400px] gap-6 px-5 py-10 md:px-8 lg:grid-cols-[1.2fr_1fr]">
      <Panel hud className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-ion/10 blur-3xl" />
        <div className="relative flex flex-col items-center gap-8 px-6 py-14 text-center md:py-20">
          <div className="relative grid size-44 place-items-center">
            <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
              <circle cx="50" cy="50" r="46" fill="none" stroke="#1c2230" strokeWidth="2" />
              <circle cx="50" cy="50" r="46" fill="none" stroke="#8ff3ff" strokeWidth="2" strokeLinecap="round" strokeDasharray={`${progress * 289} 289`} className="transition-[stroke-dasharray] duration-1000" />
            </svg>
            <div>
              <Droplets className="mx-auto size-6 text-ion" strokeWidth={1.4} />
              <div className="mt-2 font-display text-4xl font-bold tabular-nums tracking-tight">{drip !== undefined ? formatPWSI(drip) : "2,500"}</div>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-mist">PWSI per claim</div>
            </div>
          </div>
          {!isConnected ? (
            <WalletButton />
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Button size="lg" className="min-w-64" disabled={!ready || !isDeployed || needsGas} loading={pending !== null} onClick={claim} data-testid="faucet-claim">
                {ready ? "Claim test PWSI" : `Next claim in ${formatCountdown(nextMs - now)}`}
              </Button>
              {needsGas && <p className="text-sm text-si">You need testnet ETH for gas first — see the gas faucets.</p>}
            </div>
          )}
          <div className="grid w-full max-w-md grid-cols-3 gap-4 border-t border-line pt-6 font-mono text-xs">
            <div><div className="text-mist">Your PWSI</div><div className="mt-1 text-ink">{formatPWSI(balance)}</div></div>
            <div><div className="text-mist">Cooldown</div><div className="mt-1 text-ink">{cooldown ? `${Number(cooldown) / 3600}h` : "24h"}</div></div>
            <div><div className="text-mist">Total claims</div><div className="mt-1 text-ink">{claims?.toString() ?? "—"}</div></div>
          </div>
        </div>
      </Panel>

      <div className="flex flex-col gap-6">
        <Panel>
          <PanelHeader>
            <div className="flex items-center gap-2"><Fuel className="size-4 text-solar" /><h2 className="font-display text-lg font-bold tracking-tight">Gas (testnet ETH)</h2></div>
            <span className="font-mono text-xs text-mist">{eth ? `${Number(eth.formatted).toFixed(4)} ETH` : "—"}</span>
          </PanelHeader>
          <div className="flex flex-col gap-3 p-5 text-sm text-haze">
            <p>Transactions on {targetChain.name} are paid in ETH. Grab some from an official faucet:</p>
            {gasFaucets.length ? (
              gasFaucets.map((f) => (
                <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-sm border border-line bg-void/40 px-4 py-3 transition hover:border-line-strong">
                  <span>{f.label}</span>
                  <ExternalLink className="size-4 text-mist" />
                </a>
              ))
            ) : (
              <p className="font-mono text-xs text-mist">Local chain — dev accounts are pre-funded.</p>
            )}
          </div>
        </Panel>
        <Panel>
          <PanelHeader><h2 className="font-display text-lg font-bold tracking-tight">Faucet rules</h2></PanelHeader>
          <ul className="grid gap-3 p-5 text-sm text-haze">
            <li className="flex gap-3"><span className="font-mono text-ion">01</span>One claim per wallet every {cooldown ? Number(cooldown) / 3600 : 24} hours, enforced by the faucet contract.</li>
            <li className="flex gap-3"><span className="font-mono text-ion">02</span>Faucet mints count against the 1B lifetime cap. {totalDripped !== undefined && `${formatPWSI(totalDripped, { compact: true })} PWSI dripped so far.`}</li>
            <li className="flex gap-3"><span className="font-mono text-ion">03</span>Testnet only. Test PWSI has no monetary value and the faucet will not exist on mainnet.</li>
          </ul>
        </Panel>
      </div>
    </section>
  );
}
