import type { SVGProps } from "react";
import { X_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

/** The X (formerly Twitter) logo. */
export function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** Icon-only link to the project's X account (new tab). */
export function XIconLink({ className }: { className?: string }) {
  return (
    <a
      href={X_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Planet Wars SI on X (@PlanetWSI)"
      title="@PlanetWSI on X"
      className={cn(
        "grid size-9 place-items-center rounded-sm border border-line-strong text-haze transition hover:border-ink/40 hover:text-ink",
        className,
      )}
    >
      <XIcon className="size-3.5" />
    </a>
  );
}
