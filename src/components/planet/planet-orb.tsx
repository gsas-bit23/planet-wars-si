import type { CSSProperties } from "react";
import type { PlanetMeta } from "@/lib/planets";
import { cn } from "@/lib/utils";

/** Lightweight CSS planet (no WebGL) — scrolling equirectangular texture inside a lit sphere. */
export function PlanetOrb({ planet, size = 120, className, speed }: { planet: PlanetMeta; size?: number; className?: string; speed?: number }) {
  const style: CSSProperties = {
    width: size,
    height: size,
    backgroundImage: `url(${planet.textureSmall})`,
    animationDuration: `${speed ?? 20 + planet.period / 2}s`,
    filter: "saturate(1.05) contrast(1.05)",
    zIndex: 1,
  };
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <div
        className="absolute inset-[-18%] rounded-full opacity-50 blur-2xl"
        style={{ background: `radial-gradient(circle, ${planet.glow}55, transparent 65%)` }}
      />
      {planet.ring && (
        <div
          className="absolute left-1/2 top-1/2 h-[34%] w-[210%] -translate-x-1/2 -translate-y-1/2 -rotate-[18deg] rounded-[50%] border-[6px] border-[#e8d9b0]/40 shadow-[0_0_0_2px_rgba(232,217,176,0.12)]"
          style={{ clipPath: "polygon(0 50%, 100% 50%, 100% 100%, 0 100%)", zIndex: 2 }}
        />
      )}
      <div className="orb absolute inset-0" style={style} />
      {planet.ring && (
        <div
          className="absolute left-1/2 top-1/2 h-[34%] w-[210%] -translate-x-1/2 -translate-y-1/2 -rotate-[18deg] rounded-[50%] border-[6px] border-[#e8d9b0]/30"
          style={{ clipPath: "polygon(0 0, 100% 0, 100% 50%, 0 50%)", zIndex: 0 }}
        />
      )}
    </div>
  );
}
