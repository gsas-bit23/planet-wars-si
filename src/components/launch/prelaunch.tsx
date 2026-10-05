import Link from "next/link";
import { Rocket } from "lucide-react";
import { isDeployed } from "@/lib/contracts";
import { targetChain } from "@/lib/chains";
import { X_HANDLE, X_URL } from "@/lib/site";
import { XIcon } from "@/components/ui/x-icon";
import { cn } from "@/lib/utils";

/** True until the game contracts exist on the target chain. */
export const PRE_LAUNCH = !isDeployed;

export function FollowOnX({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  return (
    <a
      href={X_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-2 rounded-sm border border-line-strong bg-white/[0.03] font-mono uppercase tracking-[0.14em] text-ink transition hover:border-ink/40 hover:bg-white/[0.06]",
        size === "sm" ? "h-8 px-3 text-[10.5px]" : "h-11 px-4 text-[11px]",
        className,
      )}
    >
      <XIcon className="size-3.5" /> Follow {X_HANDLE}
    </a>
  );
}

/**
 * Pre-launch notice for pages whose actions need the game contracts. Renders nothing after launch.
 */
export function PrelaunchNotice({
  title = "Launching soon",
  children,
  className,
}: {
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  if (!PRE_LAUNCH) return null;
  return (
    <div
      data-testid="prelaunch-notice"
      className={cn(
        "hud relative overflow-hidden rounded-md border border-solar/25 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(245,166,35,0.10)_0%,rgba(7,9,15,0.6)_55%)] px-5 py-5 md:px-6",
        className,
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3.5">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-sm border border-solar/30 bg-solar/10 text-solar">
            <Rocket className="size-4" />
          </span>
          <div>
            <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-solar">
              <span className="size-1.5 animate-pulse rounded-full bg-solar" /> {title} · {targetChain.name}
            </div>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-haze">
              {children ??
                "The PWSI token launches on the pons launchpad, and the game contracts go live right after. Until then you can explore every world and follow the SI — claiming, trading and rewards open at launch."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <FollowOnX size="sm" />
          <Link
            href="/planets"
            className="inline-flex h-8 items-center rounded-sm px-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-mist transition hover:text-ink"
          >
            Explore worlds →
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Page-width wrapper for {@link PrelaunchNotice}; renders nothing after launch. */
export function PrelaunchSection(props: { title?: string; children?: React.ReactNode }) {
  if (!PRE_LAUNCH) return null;
  return (
    <div className="mx-auto mb-8 max-w-[1400px] px-5 md:px-8">
      <PrelaunchNotice {...props} />
    </div>
  );
}
