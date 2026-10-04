import * as React from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="relative border-b border-line">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="relative mx-auto flex max-w-[1400px] flex-col gap-6 px-5 pb-10 pt-[calc(var(--header-h)+48px)] md:flex-row md:items-end md:justify-between md:px-8">
        <div className="flex max-w-3xl flex-col gap-4">
          <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-mist">
            <span className="size-1.5 animate-flicker rounded-full bg-si" />
            {eyebrow}
          </div>
          <h1 className="text-balance font-display text-5xl font-bold leading-[0.92] tracking-[-0.035em] md:text-7xl">
            {title}
          </h1>
          {description && <p className="max-w-2xl text-pretty text-[15px] leading-relaxed text-haze">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
      </div>
    </header>
  );
}
