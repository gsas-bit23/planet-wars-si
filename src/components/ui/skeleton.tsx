import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-sm bg-gradient-to-r from-line/60 via-line-strong/40 to-line/60",
        className,
      )}
    />
  );
}
