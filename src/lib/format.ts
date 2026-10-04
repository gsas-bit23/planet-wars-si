import { formatUnits } from "viem";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
const full = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** Format a PWSI wei amount. */
export function formatPWSI(value: bigint | undefined, opts: { compact?: boolean; digits?: number } = {}) {
  if (value === undefined) return "—";
  const n = Number(formatUnits(value, 18));
  if (opts.compact && Math.abs(n) >= 10_000) return compact.format(n);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: opts.digits ?? 2 }).format(n);
}

export function formatNumber(n: number | bigint | undefined) {
  if (n === undefined) return "—";
  return full.format(typeof n === "bigint" ? Number(n) : n);
}

export function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
}

export function timeAgo(date: Date | string | number) {
  const d = typeof date === "object" ? date : new Date(date);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
