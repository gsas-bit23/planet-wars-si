"use client";

import { useEffect, useState } from "react";

const GLYPHS = "▓▒░█<>/\\|=+*#01ΣΔΩ";

/** Terminal-style decode-in effect for short strings. */
export function DecodeText({ text, delay = 0, speed = 28, className }: { text: string; delay?: number; speed?: number; className?: string }) {
  const [out, setOut] = useState(() => text.replace(/\S/g, " "));
  useEffect(() => {
    let frame = 0;
    let raf = 0;
    let last = 0;
    const start = performance.now() + delay;
    const tick = (t: number) => {
      if (t < start) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (t - last > speed) {
        last = t;
        frame++;
        const reveal = Math.floor(frame * 1.5);
        setOut(
          text
            .split("")
            .map((ch, i) => (ch === " " ? " " : i < reveal ? ch : GLYPHS[(i + frame) % GLYPHS.length]))
            .join(""),
        );
        if (reveal >= text.length) return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, delay, speed]);
  return (
    <span className={className} aria-label={text}>
      {out}
    </span>
  );
}
