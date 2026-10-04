import * as React from "react";
import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  sub,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "si" | "ion" | "solar";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-mist">{label}</span>
      <span
        className={cn(
          "font-display text-2xl font-bold tabular-nums tracking-tight md:text-3xl",
          tone === "si" && "text-si",
          tone === "ion" && "text-ion",
          tone === "solar" && "text-solar",
        )}
      >
        {value}
      </span>
      {sub && <span className="text-xs text-mist">{sub}</span>}
    </div>
  );
}
