import { isDeployed } from "@/lib/contracts";
import { targetChain } from "@/lib/chains";

/** Shown only when the target chain has no deployment configured. */
export function NetworkBanner() {
  if (isDeployed) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-si/30 bg-[#1a0b0b]/90 px-5 py-2.5 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-si backdrop-blur">
      Contracts are not deployed on {targetChain.name} yet — on-chain actions are disabled. Browsing in preview mode.
    </div>
  );
}
