"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Zone } from "@/lib/planets";

export type CellState = "open" | "claimed" | "mine" | "listed";

type Props = {
  supply: number;
  cols: number;
  zones: Zone[] | null;
  claimed: Uint8Array;
  mine: Set<number>;
  listed: Set<number>;
  selected: Set<number>;
  onToggle: (plot: number) => void;
  onHover: (plot: number | null) => void;
  focus?: number | null;
};

const ZONE_FILL = ["#151a25", "#1b2547", "#3a2c0c"];
const ZONE_EDGE = ["#222a3a", "#3a4f9a", "#a37a1c"];

/**
 * Canvas-rendered territory grid. Handles 5,000+ plots at 60fps with hover, selection,
 * keyboard-less pointer interaction and DPR-aware rendering.
 */
export function TerritoryGrid({ supply, cols, zones, claimed, mine, listed, selected, onToggle, onHover, focus }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const rows = Math.ceil(supply / cols);
  const gap = cols > 60 ? 1 : 2;
  const cell = width ? (width - gap * (cols - 1)) / cols : 0;
  const height = rows * cell + gap * (rows - 1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(
    (t: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !cell) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const pulse = 0.55 + 0.45 * Math.sin(t / 380);
      const r = Math.min(3, cell / 5);

      for (let i = 0; i < supply; i++) {
        const x = (i % cols) * (cell + gap);
        const y = Math.floor(i / cols) * (cell + gap);
        const z = zones ? zones[i]! : 0;
        let fill = ZONE_FILL[z]!;
        let stroke: string | null = cell > 7 ? ZONE_EDGE[z]! : null;

        if (claimed[i]) {
          fill = z === 2 ? "#6b4d12" : z === 1 ? "#2d3d7a" : "#2b3243";
          stroke = null;
        }
        if (listed.has(i)) {
          fill = "#3d2a08";
          stroke = "#ffb547";
        }
        if (mine.has(i)) {
          fill = "#0f4c58";
          stroke = "#8ff3ff";
        }
        if (selected.has(i)) {
          fill = `rgba(238,240,244,${0.75 + 0.25 * pulse})`;
          stroke = "#ffffff";
        }
        if (hover === i || focus === i) {
          stroke = "#ffffff";
        }

        ctx.fillStyle = fill;
        if (r > 1) {
          ctx.beginPath();
          ctx.roundRect(x, y, cell, cell, r);
          ctx.fill();
          if (stroke) {
            ctx.strokeStyle = stroke;
            ctx.lineWidth = hover === i ? 1.5 : 1;
            ctx.stroke();
          }
        } else {
          ctx.fillRect(x, y, cell, cell);
          if (stroke && (hover === i || selected.has(i) || mine.has(i))) {
            ctx.strokeStyle = stroke;
            ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
          }
        }
        // Claimed-by-others hatch for larger cells
        if (claimed[i] && !mine.has(i) && !listed.has(i) && cell > 10) {
          ctx.strokeStyle = "rgba(255,255,255,0.08)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + 2, y + cell - 2);
          ctx.lineTo(x + cell - 2, y + 2);
          ctx.stroke();
        }
      }
    },
    [cell, claimed, cols, focus, gap, height, hover, listed, mine, selected, supply, width, zones],
  );

  // Animate only while something is selected (pulse), otherwise draw once per change.
  useEffect(() => {
    let raf = 0;
    if (selected.size > 0) {
      const loop = (t: number) => {
        draw(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    } else {
      draw(0);
    }
    return () => cancelAnimationFrame(raf);
  }, [draw, selected.size]);

  const plotAt = (e: React.PointerEvent | React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const c = Math.floor(x / (cell + gap));
    const r = Math.floor(y / (cell + gap));
    if (c < 0 || c >= cols || r < 0) return null;
    const i = r * cols + c;
    return i < supply ? i : null;
  };

  const aria = useMemo(() => `Territory grid, ${supply} plots, ${cols} columns`, [supply, cols]);

  return (
    <div ref={wrapRef} className="w-full select-none">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={aria}
        data-testid="territory-grid"
        style={{ width, height, cursor: hover !== null && !claimed[hover] ? "pointer" : "default" }}
        onPointerMove={(e) => {
          const i = plotAt(e);
          if (i !== hover) {
            setHover(i);
            onHover(i);
          }
        }}
        onPointerLeave={() => {
          setHover(null);
          onHover(null);
        }}
        onClick={(e) => {
          const i = plotAt(e);
          if (i !== null) onToggle(i);
        }}
      />
    </div>
  );
}
