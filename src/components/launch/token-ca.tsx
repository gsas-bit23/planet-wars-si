"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { addresses, getPwsiLink } from "@/lib/contracts";
import { explorerToken, targetChain } from "@/lib/chains";
import { cn } from "@/lib/utils";

/** The live token contract address (CA). Null before launch. */
export const TOKEN_CA: `0x${string}` | null = addresses?.token ?? null;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers without the async clipboard API (or insecure contexts).
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/**
 * Contract-address pill: label, address (truncated on small screens, the full address is always
 * what gets copied), copy button with feedback, and links to the explorer and the pons page.
 */
export function TokenCA({ variant = "hero", className }: { variant?: "hero" | "compact"; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!TOKEN_CA) return null;
  const ca = TOKEN_CA;
  const explorer = explorerToken(ca);
  const buy = getPwsiLink?.external ? getPwsiLink.href : null;

  const onCopy = async () => {
    if (await copyText(ca)) {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    }
  };

  const hero = variant === "hero";
  const linkCls =
    "inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-haze transition hover:text-ink";

  return (
    <div className={cn("flex flex-col gap-2.5", className)} data-testid="token-ca">
      <div
        className={cn(
          "group/ca flex w-fit max-w-full items-center gap-1 rounded-full border border-line-strong bg-white/[0.035] p-1 pl-3.5 backdrop-blur-sm transition hover:border-ion/40",
          hero ? "shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_8px_30px_-12px_rgba(77,201,255,0.25)]" : "",
        )}
      >
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-solar">$PWSI CA</span>
        <span className="mx-2 h-3.5 w-px shrink-0 bg-line-strong" aria-hidden />
        <code
          className={cn("min-w-0 truncate font-mono text-ink", hero ? "text-[12.5px]" : "text-[11.5px]")}
          title={ca}
          aria-label={`Token contract address ${ca}`}
        >
          <span className="sm:hidden">{short(ca)}</span>
          <span className={cn("hidden", hero ? "sm:inline" : "sm:inline lg:hidden xl:inline")}>{ca}</span>
          {!hero && <span className="hidden lg:inline xl:hidden">{short(ca)}</span>}
        </code>
        <button
          type="button"
          onClick={onCopy}
          data-testid="copy-ca"
          aria-label={copied ? "Address copied" : "Copy token contract address"}
          className={cn(
            "ml-2 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 font-mono text-[10px] uppercase tracking-[0.14em] transition",
            copied ? "bg-ion/15 text-ion" : "bg-white/[0.06] text-haze hover:bg-white/[0.12] hover:text-ink",
          )}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pl-1">
        {explorer && (
          <a href={explorer} target="_blank" rel="noopener noreferrer" className={linkCls}>
            {targetChain.blockExplorers?.default.name ?? "Explorer"} <ExternalLink className="size-3" />
          </a>
        )}
        {buy && (
          <a href={buy} target="_blank" rel="noopener noreferrer" className={cn(linkCls, "text-solar hover:text-solar")}>
            Buy on pons <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </div>
  );
}
