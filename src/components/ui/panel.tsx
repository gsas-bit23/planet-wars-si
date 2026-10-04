import * as React from "react";
import { cn } from "@/lib/utils";

/** Base surface: a hairline-bordered glass panel with optional HUD corner brackets. */
export function Panel({
  className,
  hud,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { hud?: boolean; tone?: "default" | "si" | "ion" }) {
  return (
    <div
      className={cn(
        "relative rounded-md border bg-gradient-to-b from-panel/80 to-hull/80 backdrop-blur-xl",
        tone === "default" && "border-line",
        tone === "si" && "border-si/25 from-[#1a0c0d]/80",
        tone === "ion" && "border-ion/20",
        hud && "hud",
        hud && tone === "si" && "hud-si",
        className,
      )}
      {...props}
    />
  );
}

export function PanelHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-between gap-4 border-b border-line px-5 py-3.5", className)}
      {...props}
    />
  );
}

export function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("font-mono text-[11px] uppercase tracking-[0.18em] text-mist", className)}
      {...props}
    />
  );
}
