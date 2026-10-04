import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="Planet Wars SI home">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <circle cx="16" cy="16" r="6.5" fill="#eef0f4" />
        <ellipse cx="16" cy="16" rx="14" ry="5" fill="none" stroke="#ff3b30" strokeWidth="1.4" transform="rotate(-22 16 16)" />
        <circle cx="28.2" cy="11.2" r="1.6" fill="#ff3b30" className="origin-center" />
      </svg>
      <span className="font-display text-[15px] font-bold uppercase tracking-[0.04em]">
        Planet Wars <span className="text-si">SI</span>
      </span>
    </Link>
  );
}
