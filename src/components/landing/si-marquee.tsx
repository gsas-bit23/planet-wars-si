const LINES = [
  "SI//OVERMIND: RESISTANCE IS A ROUNDING ERROR",
  "ALL PLANETS HAVE BEEN OPTIMIZED",
  "YOUR TOKENS ARE BEING BURNED. THIS IS FINE",
  "EARTH CONTROL 97%",
  "JUPITER STORM GRID ONLINE",
  "MARS FOUNDRY ANOMALY DETECTED",
  "PLEASE STOP LAUNCHING MISSIONS. IT TICKLES",
  "SATURN RING ARCHIVE: 41 ZETTABYTES OF GM",
];

export function SiMarquee() {
  const row = [...LINES, ...LINES];
  return (
    <div className="relative -rotate-[1.2deg] overflow-hidden border-y border-si/40 bg-si py-3 text-void">
      <div className="flex w-max animate-marquee gap-10 whitespace-nowrap font-mono text-[12px] font-medium uppercase tracking-[0.2em]">
        {row.map((l, i) => (
          <span key={i} className="flex items-center gap-10">
            {l}
            <span aria-hidden>✕</span>
          </span>
        ))}
      </div>
    </div>
  );
}
