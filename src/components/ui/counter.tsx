"use client";

import { useEffect, useRef } from "react";
import { animate, useInView } from "motion/react";

/** Tweened number that animates when scrolled into view and on every value change. */
export function Counter({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  useEffect(() => {
    if (!inView || !ref.current) return;
    const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
    const controls = animate(prev.current, value, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = fmt.format(v);
      },
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, decimals, inView]);
  return (
    <span ref={ref} className={className}>
      0
    </span>
  );
}
