import { isDeployed } from "@/lib/contracts";
import { targetChain } from "@/lib/chains";
import { X_HANDLE, X_URL } from "@/lib/site";
import { XIcon } from "@/components/ui/x-icon";

/** Slim pre-launch strip under the header, until the game contracts are live. */
export function NetworkBanner() {
  if (isDeployed) return null;
  return (
    <div
      data-testid="launch-banner"
      className="fixed inset-x-0 top-[var(--header-h)] z-40 border-b border-solar/15 bg-[linear-gradient(90deg,rgba(40,26,6,0.92),rgba(12,10,8,0.85)_60%,rgba(4,5,10,0.8))] px-5 py-2 backdrop-blur-md md:px-8"
    >
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-6 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.16em]">
        <span className="flex items-center gap-2 text-solar">
          <span className="size-1.5 animate-pulse rounded-full bg-solar shadow-[0_0_8px_#f5a623]" />
          Launching soon on {targetChain.name}
          <span className="hidden text-mist sm:inline">· PWSI launches on pons · game opens at launch</span>
        </span>
        <a href={X_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-haze transition hover:text-ink">
          <XIcon className="size-3" /> Follow {X_HANDLE} for the launch
        </a>
      </div>
    </div>
  );
}
