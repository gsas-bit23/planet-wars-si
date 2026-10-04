"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BaseError, ContractFunctionRevertedError, type Abi, type Address, maxUint256 } from "viem";
import { useAccount, useConfig } from "wagmi";
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { addresses, tokenAbi, territoryAbi } from "@/lib/contracts";
import { explorerTx } from "@/lib/chains";

/** Human-readable error from a viem/wagmi error (custom error names included). */
export function errorMessage(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name) return humanizeError(name);
      if (revert.reason) return revert.reason;
    }
    if (err.shortMessage) return err.shortMessage.replace(/^.*User rejected.*$/s, "Request rejected in wallet.");
  }
  return err instanceof Error ? err.message : "Transaction failed";
}

const ERRORS: Record<string, string> = {
  CooldownActive: "Faucet cooldown is still active for this wallet.",
  PlotTaken: "Someone just claimed that plot. Pick another.",
  BodyInactive: "Claims on this world are paused.",
  ERC20InsufficientBalance: "Not enough PWSI. Grab some from the faucet.",
  ERC20InsufficientAllowance: "Token allowance too low — approve and retry.",
  PriceAboveMax: "The seller changed the price. Refresh and review.",
  CannotBuyOwn: "That's your own listing.",
  NotListed: "This listing is no longer active.",
  MaxLevel: "Territory is already at max level.",
  ShieldCap: "Shield cap reached for this territory.",
  NotTerritoryOwner: "You must hold this territory in your wallet (not listed).",
  EnforcedPause: "This contract is paused by the operators.",
};

function humanizeError(name: string) {
  return ERRORS[name] ?? name.replace(/([a-z])([A-Z])/g, "$1 $2");
}

type WriteArgs = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
};

/**
 * Sends a transaction, waits for the receipt, toasts progress and refreshes every wagmi
 * query afterwards so balances and grids update instantly.
 */
export function useTx() {
  const config = useConfig();
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  const send = useCallback(
    async (label: string, req: WriteArgs) => {
      setPending(label);
      const id = toast.loading(`${label}…`, { description: "Confirm in your wallet" });
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hash = await writeContract(config, req as any);
        toast.loading(`${label}…`, { id, description: "Waiting for confirmation" });
        const receipt = await waitForTransactionReceipt(config, { hash });
        if (receipt.status !== "success") throw new Error("Transaction reverted");
        const url = explorerTx(hash);
        toast.success(label, {
          id,
          description: "Confirmed on-chain",
          action: url ? { label: "View", onClick: () => window.open(url, "_blank") } : undefined,
        });
        await qc.invalidateQueries();
        return receipt;
      } catch (err) {
        toast.error(`${label} failed`, { id, description: errorMessage(err) });
        throw err;
      } finally {
        setPending(null);
      }
    },
    [config, qc],
  );

  return { send, pending };
}

/** Ensure `spender` can pull `amount` PWSI from the connected wallet, approving if needed. */
export function useEnsureAllowance() {
  const config = useConfig();
  const { address } = useAccount();
  const { send } = useTx();

  return useCallback(
    async (spender: Address, amount: bigint, opts: { unlimited?: boolean } = {}) => {
      if (!addresses || !address) throw new Error("Wallet not connected");
      const current = (await readContract(config, {
        address: addresses.token,
        abi: tokenAbi,
        functionName: "allowance",
        args: [address, spender],
      })) as bigint;
      if (current >= amount) return;
      await send("Approve PWSI", {
        address: addresses.token,
        abi: tokenAbi as Abi,
        functionName: "approve",
        args: [spender, opts.unlimited ? maxUint256 : amount],
      });
    },
    [address, config, send],
  );
}

/** Ensure the marketplace can escrow the wallet's territories. */
export function useEnsureOperator() {
  const config = useConfig();
  const { address } = useAccount();
  const { send } = useTx();
  return useCallback(async () => {
    if (!addresses || !address) throw new Error("Wallet not connected");
    const ok = (await readContract(config, {
      address: addresses.territory,
      abi: territoryAbi,
      functionName: "isApprovedForAll",
      args: [address, addresses.marketplace],
    })) as boolean;
    if (ok) return;
    await send("Authorize marketplace", {
      address: addresses.territory,
      abi: territoryAbi as Abi,
      functionName: "setApprovalForAll",
      args: [addresses.marketplace, true],
    });
  }, [address, config, send]);
}
