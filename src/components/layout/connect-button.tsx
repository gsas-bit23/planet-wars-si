"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AlertTriangle, ChevronDown, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwsiBalance } from "@/lib/hooks/use-game";
import { formatPWSI } from "@/lib/format";

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { data: balance } = usePwsiBalance();
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;
        if (!ready) return <div className="h-9 w-36" aria-hidden />;
        if (!connected)
          return (
            <Button size="sm" onClick={openConnectModal} className="h-9 px-4" data-testid="connect-wallet">
              <Wallet /> Connect
            </Button>
          );
        if (chain.unsupported)
          return (
            <Button size="sm" variant="si" onClick={openChainModal} className="h-9">
              <AlertTriangle /> Wrong network
            </Button>
          );
        return (
          <button
            onClick={openAccountModal}
            data-testid="wallet-connected"
            className="group flex h-9 items-center gap-3 rounded-sm border border-line-strong bg-hull/80 pl-3 pr-2 text-sm transition hover:border-haze/40"
          >
            {!compact && (
              <span className="font-mono text-xs tabular-nums text-ion">
                {formatPWSI(balance, { compact: true })} <span className="text-mist">PWSI</span>
              </span>
            )}
            <span className="h-4 w-px bg-line-strong" />
            <span className="font-mono text-xs text-ink">{account.displayName}</span>
            <ChevronDown className="size-3.5 text-mist transition group-hover:text-ink" />
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
