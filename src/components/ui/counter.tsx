"use client";

import { useEffect, useRef } from "react";
import { animate, useInView } from "motion/react";

/** Tweened number that animates when scrolled into view and on every value change. */
export function Counter({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView || !ref.current) return;
    const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
    const controls = animate(prev.current, value, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        prev.current = v;
        if (ref.current) ref.current.textContent = fmt.format(v);
      },
    });
    // Ensure the final value is shown even if from === to (no onUpdate fires).
    if (prev.current === value && ref.current) ref.current.textContent = fmt.format(value);
    return () => controls.stop();
  }, [value, decimals, inView]);
  return (
    <span ref={ref} className={className}>
      0
    </span>
  );
}
