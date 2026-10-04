export type AttackStatus = "incoming" | "active" | "repelled" | "breached";

export type Broadcast = {
  id: string;
  day: string;
  title: string;
  body: string;
  threatLevel: number;
  focusBodyId: number;
  source: "template" | "llm";
  createdAt: string;
};

export type Attack = {
  id: string;
  day: string;
  bodyId: number;
  sector: string;
  kind: string;
  severity: number;
  startsAt: string;
  endsAt: string;
};

export type Defense = {
  attackId: string;
  wallet: string;
  tokenId: string;
  power: number;
  createdAt: string;
};

export type AttackView = Attack & {
  status: AttackStatus;
  defensePower: number;
  defenders: number;
  /** Severity after mission sabotage modifiers. */
  effectiveSeverity: number;
};

export type PlanetControl = { bodyId: number; control: number; delta7d: number };
