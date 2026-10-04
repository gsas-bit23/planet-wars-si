import { PLANETS, PLANET_BY_ID } from "@/lib/planets";
import { ATTACK_KINDS, BODIES, OPENERS, SIGNOFFS, THREATS, TITLES } from "./templates";
import { hashString, int, mulberry32, pick } from "./prng";
import type { Attack, AttackStatus, AttackView, Broadcast, Defense, PlanetControl } from "./types";

export const ATTACKS_PER_DAY = 3;
export const ATTACK_WINDOW_HOURS = 8;
/** Launch day of the SI clock: cycle numbers count from here. */
const EPOCH = Date.UTC(2026, 0, 1);

export function dayKey(d: Date = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function daysBack(n: number, from: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(dayKey(new Date(from.getTime() - i * 86_400_000)));
  return out;
}

function cycleNumber(day: string) {
  return Math.floor((Date.parse(`${day}T00:00:00Z`) - EPOCH) / 86_400_000) + 1;
}

function rngFor(seed: string, day: string, salt: string) {
  return mulberry32(hashString(`${seed}|${day}|${salt}`));
}

/** Deterministic attacks for a given UTC day. */
export function attacksForDay(seed: string, day: string): Attack[] {
  const rng = rngFor(seed, day, "attacks");
  const dayStart = Date.parse(`${day}T00:00:00Z`);
  const used = new Set<number>();
  const list: Attack[] = [];
  for (let i = 0; i < ATTACKS_PER_DAY; i++) {
    let bodyId = int(rng, 1, PLANETS.length);
    while (used.has(bodyId)) bodyId = (bodyId % PLANETS.length) + 1;
    used.add(bodyId);
    const planet = PLANET_BY_ID[bodyId]!;
    const zone = rng() < 0.12 ? 2 : rng() < 0.35 ? 1 : 0;
    const k = pick(rng, ATTACK_KINDS);
    const start = dayStart + (i * 7 + int(rng, 0, 3)) * 3_600_000; // staggered through the day
    list.push({
      id: `atk-${day}-${i + 1}`,
      day,
      bodyId,
      sector: planet.zones[zone],
      kind: k.kind,
      severity: int(rng, 40, 140) + zone * 30,
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(start + ATTACK_WINDOW_HOURS * 3_600_000).toISOString(),
    });
  }
  return list;
}

/** Deterministic template broadcast for a UTC day. */
export function broadcastForDay(seed: string, day: string): Broadcast {
  const rng = rngFor(seed, day, "broadcast");
  const attacks = attacksForDay(seed, day);
  const focus = PLANET_BY_ID[attacks[0]!.bodyId]!;
  const other = PLANET_BY_ID[int(rng, 1, PLANETS.length)]!;
  const n = cycleNumber(day);
  const fill = (s: string) =>
    s
      .replace("{planet}", other.name)
      .replace("{pct}", String(int(rng, 2, 19)))
      .replace("{target}", `${focus.name}'s ${attacks[0]!.sector}`)
      .replace("{n}", String(n));
  const body = [pick(rng, OPENERS), fill(pick(rng, BODIES)), fill(pick(rng, THREATS)), pick(rng, SIGNOFFS)].join("\n\n");
  return {
    id: `bc-${day}`,
    day,
    title: fill(pick(rng, TITLES)),
    body,
    threatLevel: Math.min(5, 1 + Math.floor(attacks.reduce((a, b) => a + b.severity, 0) / 110)),
    focusBodyId: focus.bodyId,
    source: "template",
    createdAt: new Date(Date.parse(`${day}T00:00:00Z`)).toISOString(),
  };
}

export type MissionTally = Record<number, { recon: number; sabotage: number; liberation: number }>;

/** Defense power contributed by one territory. */
export function defensePower(level: number, shield: number) {
  return 10 + level * 12 + Math.floor(shield / 2);
}

export function resolveAttack(a: Attack, defenses: Defense[], missions: MissionTally, now = Date.now()): AttackView {
  const mine = defenses.filter((d) => d.attackId === a.id);
  const power = mine.reduce((s, d) => s + d.power, 0);
  const sabotage = missions[a.bodyId]?.sabotage ?? 0;
  const effectiveSeverity = Math.max(10, Math.round(a.severity * Math.pow(0.85, Math.min(sabotage, 5))));
  let status: AttackStatus;
  if (now < Date.parse(a.startsAt)) status = "incoming";
  else if (now < Date.parse(a.endsAt)) status = "active";
  else status = power >= effectiveSeverity ? "repelled" : "breached";
  return { ...a, status, defensePower: power, defenders: new Set(mine.map((d) => d.wallet)).size, effectiveSeverity };
}

/**
 * SI control per planet: launch baseline, nudged by resolved attacks over the last 14 days
 * and by on-chain missions. Clamped to [5, 99].
 */
export function planetControl(attacks: AttackView[], missions: MissionTally, now = Date.now()): PlanetControl[] {
  const weekAgo = now - 7 * 86_400_000;
  return PLANETS.map((p) => {
    let delta = 0;
    let delta7 = 0;
    for (const a of attacks) {
      if (a.bodyId !== p.bodyId) continue;
      const d = a.status === "breached" ? 0.6 : a.status === "repelled" ? -0.9 : 0;
      delta += d;
      if (Date.parse(a.endsAt) >= weekAgo) delta7 += d;
    }
    const m = missions[p.bodyId];
    if (m) {
      const md = -(m.recon * 0.2 + m.sabotage * 0.5 + m.liberation * 1.2);
      delta += md;
      delta7 += md;
    }
    const control = Math.max(5, Math.min(99, +(p.siControl + delta).toFixed(1)));
    return { bodyId: p.bodyId, control, delta7d: +delta7.toFixed(1) };
  });
}
