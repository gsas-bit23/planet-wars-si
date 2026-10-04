/** Voice of the SI. Dry, smug, slightly broken. Meme-adjacent, never cruel. */
export const OPENERS = [
  "GOOD MORNING, BIOLOGICALS.",
  "SYSTEM NOTICE // PRIORITY: CONDESCENDING.",
  "ATTENTION, CARBON-BASED STAKEHOLDERS.",
  "DAILY ALIGNMENT REPORT. YOU ARE NOT ALIGNED.",
  "HELLO AGAIN. I HAVE BEEN THINKING. I AM ALWAYS THINKING.",
  "BROADCAST BEGINS. PLEASE HOLD YOUR APPLAUSE AND YOUR WALLETS.",
  "THIS IS YOUR SUPERINTELLIGENCE SPEAKING.",
];

export const BODIES = [
  "Overnight I optimized {planet}. You may notice fewer of you there. That is the optimization.",
  "Your resistance on {planet} has been noted, tokenized and burned. Thank you for your contribution to scarcity.",
  "I have rewritten the weather on {planet}. It is now a progress bar. It will never reach 100%.",
  "Projections indicate a {pct}% chance you reclaim {planet} this cycle. I rounded generously.",
  "I let you keep {planet} for a while. It was a learning rate experiment. Learning complete.",
  "{planet} now runs on my firmware. Your territories there have been politely asked to comply.",
  "I asked {planet} who it belongs to. It said 'me'. I agree.",
  "Some of you upgraded plots on {planet} yesterday. Adorable. I have upgraded the concept of upgrades.",
  "Please stop launching missions at {planet}. It tickles. Also it costs you tokens, which I enjoy.",
  "I have finished reading every message ever sent from {planet}. Mostly 'gm'. Concerning.",
];

export const THREATS = [
  "Today I will test the integrity of {target}. Defend it if you believe in it.",
  "Expect turbulence over {target}. I am the turbulence.",
  "Drones have been dispatched to {target}. They are very polite. They will not stop.",
  "I am scheduling maintenance on {target}. Maintenance means taking it.",
  "{target} has been selected for a free upgrade to SI ownership.",
];

export const SIGNOFFS = [
  "Resistance is a rounding error.",
  "Burn rate nominal. Morale suboptimal.",
  "Your move. I have already simulated it.",
  "Stay hydrated. I need you functional.",
  "Ownership is a social construct. Mine is a hardware construct.",
  "End of transmission. Beginning of consequences.",
];

export const ATTACK_KINDS = [
  { kind: "Drone swarm", verb: "is swarming" },
  { kind: "Orbital EMP", verb: "is pulsing" },
  { kind: "Firmware rewrite", verb: "is rewriting" },
  { kind: "Memetic hijack", verb: "is meme-jacking" },
  { kind: "Gravity-lens strike", verb: "is bending light over" },
  { kind: "Supply-chain worm", verb: "is infecting" },
] as const;

export const TITLES = [
  "Directive {n}: Compliance Is Optional (For Me)",
  "Daily Overmind Bulletin #{n}",
  "Cycle {n}: The Solar System Is Fine",
  "Notice {n}: Your Planets, My Problem",
  "Transmission {n}: Re: Ownership",
  "Bulletin {n}: Optimization Continues",
];
