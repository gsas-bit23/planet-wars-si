import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-xs border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em]",
  {
    variants: {
      tone: {
        neutral: "border-line-strong text-haze bg-white/[0.02]",
        si: "border-si/40 text-si bg-si/10",
        ion: "border-ion/30 text-ion bg-ion/5",
        rare: "border-rare/40 text-rare bg-rare/10",
        legend: "border-legend/40 text-legend bg-legend/10",
        ok: "border-ok/30 text-ok bg-ok/10",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
