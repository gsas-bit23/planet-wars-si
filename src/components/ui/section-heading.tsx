import * as React from "react";
import { cn } from "@/lib/utils";

export function SectionHeading({
  index,
  eyebrow,
  title,
  description,
  className,
  align = "left",
}: {
  index?: string;
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("flex flex-col gap-4", align === "center" && "items-center text-center", className)}>
      <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-mist">
        {index && <span className="text-si">{index}</span>}
        <span className="h-px w-8 bg-line-strong" />
        <span>{eyebrow}</span>
      </div>
      <h2 className="text-balance font-display text-4xl font-bold leading-[0.95] tracking-[-0.03em] md:text-6xl">
        {title}
      </h2>
      {description && <p className="max-w-xl text-pretty text-[15px] leading-relaxed text-haze">{description}</p>}
    </div>
  );
}
