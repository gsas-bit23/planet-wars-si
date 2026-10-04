import type { ReactNode } from "react";

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-line-strong px-6 py-20 text-center">
      <h3 className="font-display text-2xl font-bold tracking-tight">{title}</h3>
      <p className="max-w-md text-sm text-mist">{body}</p>
      {action}
    </div>
  );
}
