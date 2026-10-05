"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import { Logo } from "./logo";
import { WalletButton } from "./connect-button";
import { cn } from "@/lib/utils";
import { targetChain } from "@/lib/chains";
import { NAV } from "@/lib/nav";
import { XIcon, XIconLink } from "@/components/ui/x-icon";
import { X_HANDLE, X_URL } from "@/lib/site";


export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu on navigation (render-phase state sync, no effect needed).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background,border-color,backdrop-filter] duration-300",
        scrolled || open ? "border-b border-line bg-void/75 backdrop-blur-xl" : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-[var(--header-h)] max-w-[1400px] items-center justify-between gap-6 px-5 md:px-8">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden items-center gap-0.5 xl:flex" aria-label="Main">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative whitespace-nowrap rounded-xs px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors",
                    active ? "text-ink" : "text-mist hover:text-ink",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-xs bg-white/[0.06]"
                      transition={{ type: "spring", stiffness: 400, damping: 34 }}
                    />
                  )}
                  <span className="relative">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-mist xl:flex">
            <span className="size-1.5 rounded-full bg-ok shadow-[0_0_8px_#4ade80]" />
            {targetChain.name}
          </span>
          <XIconLink className="hidden sm:grid" />
          <WalletButton />
          <button
            className="grid size-9 place-items-center rounded-sm border border-line-strong text-haze xl:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-line xl:hidden"
          >
            <div className="flex flex-col px-5 py-3">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="border-b border-line/60 py-3 font-display text-2xl font-bold tracking-tight last:border-0"
                >
                  {item.label}
                </Link>
              ))}
              <a
                href={X_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 py-3 font-mono text-xs uppercase tracking-[0.16em] text-haze hover:text-ink"
              >
                <XIcon className="size-4" /> Follow {X_HANDLE}
              </a>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
