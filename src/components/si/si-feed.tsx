"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useSignMessage } from "wagmi";
import { toast } from "sonner";
import { Radio, ShieldCheck, Swords } from "lucide-react";
import { PLANET_BY_ID, PLANETS, decodeTokenId, plotLabel } from "@/lib/planets";
import { useSiFeed } from "@/lib/hooks/use-si-feed";
import { useMyTerritories, useTerritoryStats } from "@/lib/hooks/use-game";
import { defenseMessage } from "@/lib/defense-message";
import { errorMessage } from "@/lib/hooks/use-tx";
import { formatCountdown } from "@/lib/format";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PlanetOrb } from "@/components/planet/planet-orb";
import { cn } from "@/lib/utils";
import type { AttackView } from "@/server/si/types";

const STATUS_TONE = { active: "si", incoming: "neutral", repelled: "ok", breached: "si" } as const;

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function SiFeed() {
  const { data, isLoading } = useSiFeed();
  const now = useNow();
  const [defending, setDefending] = useState<AttackView | null>(null);
  const [history, setHistory] = useState(false);

  if (isLoading || !data)
    return (
      <section className="mx-auto grid max-w-[1400px] gap-6 px-5 py-10 md:px-8 lg:grid-cols-[1.25fr_1fr]">
        <Skeleton className="h-[420px]" />
        <Skeleton className="h-[420px]" />
      </section>
    );

  const [today, ...past] = data.broadcasts;
  const live = data.attacks.filter((a) => a.status === "active" || a.status === "incoming");
  const resolved = data.attacks.filter((a) => a.status === "repelled" || a.status === "breached");
  const repelled = resolved.filter((a) => a.status === "repelled").length;

  return (
    <section className="mx-auto grid max-w-[1400px] gap-6 px-5 py-10 md:px-8 lg:grid-cols-[1.25fr_1fr]">
      <div className="flex flex-col gap-6">
        {today && (
          <Panel tone="si" hud className="overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,59,48,0.035)_0px,rgba(255,59,48,0.035)_1px,transparent_1px,transparent_3px)]" />
            <PanelHeader className="relative border-si/20">
              <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-si">
                <Radio className="size-3.5 animate-flicker" /> Broadcast · {today.day} {today.source === "llm" && "· neural"}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-mist">Threat {"▮".repeat(today.threatLevel)}{"▯".repeat(5 - today.threatLevel)}</span>
            </PanelHeader>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} className="relative p-6 md:p-8" data-testid="broadcast-today">
              <h2 className="font-display text-3xl font-bold leading-tight tracking-tight md:text-4xl">{today.title}</h2>
              <div className="mt-6 whitespace-pre-line font-mono text-[13.5px] leading-[1.75] text-haze">{today.body}</div>
              <div className="mt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-si">— SI//OVERMIND</div>
            </motion.div>
          </Panel>
        )}

        <Panel>
          <PanelHeader>
            <h3 className="font-display text-lg font-bold tracking-tight">Archive</h3>
            <button onClick={() => setHistory((h) => !h)} className="font-mono text-[11px] uppercase tracking-[0.14em] text-mist hover:text-ink">{history ? "Collapse" : "Show all"}</button>
          </PanelHeader>
          <ul className="divide-y divide-line">
            {(history ? past : past.slice(0, 4)).map((b) => (
              <li key={b.id} className="grid gap-1 px-5 py-4 md:grid-cols-[110px_1fr]">
                <span className="font-mono text-xs text-mist">{b.day}</span>
                <div>
                  <div className="font-medium text-ink">{b.title}</div>
                  <p className="mt-1 line-clamp-2 font-mono text-xs leading-relaxed text-mist">{b.body.split("\n\n").slice(1, 3).join(" ")}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="flex flex-col gap-6">
        <Panel>
          <PanelHeader>
            <div className="flex items-center gap-2"><Swords className="size-4 text-si" /><h3 className="font-display text-lg font-bold tracking-tight">Live attacks</h3></div>
            <span className="font-mono text-xs text-mist">{live.length} scheduled</span>
          </PanelHeader>
          <div className="flex flex-col gap-3 p-4" data-testid="attacks">
            {live.length === 0 && <p className="p-2 text-sm text-mist">No attacks in progress. Next wave at 00:00 UTC.</p>}
            {live.map((a) => (
              <AttackCard key={a.id} a={a} now={now} onDefend={() => setDefending(a)} />
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader>
            <h3 className="font-display text-lg font-bold tracking-tight">SI control by world</h3>
            <span className="font-mono text-xs text-mist">{repelled}/{resolved.length} repelled · 14d</span>
          </PanelHeader>
          <ul className="flex flex-col gap-3 p-5">
            {PLANETS.map((p) => {
              const c = data.control.find((x) => x.bodyId === p.bodyId);
              return (
                <li key={p.slug} className="grid grid-cols-[28px_80px_1fr_70px] items-center gap-3">
                  <PlanetOrb planet={p} size={22} speed={60} />
                  <span className="text-sm">{p.name}</span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full bg-gradient-to-r from-si-deep to-si" style={{ width: `${c?.control ?? p.siControl}%` }} /></div>
                  <span className="text-right font-mono text-xs">
                    {(c?.control ?? p.siControl).toFixed(1)}%
                    {c && c.delta7d !== 0 && <span className={c.delta7d < 0 ? "ml-1 text-ok" : "ml-1 text-si"}>{c.delta7d > 0 ? "▲" : "▼"}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader><h3 className="font-display text-lg font-bold tracking-tight">Recent outcomes</h3></PanelHeader>
          <ul className="divide-y divide-line">
            {resolved.slice(0, 8).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="truncate"><span className="text-mist">{a.day.slice(5)} · </span>{a.kind} on {PLANET_BY_ID[a.bodyId]?.name}</span>
                <Badge tone={a.status === "repelled" ? "ok" : "si"}>{a.status}</Badge>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <DefendDialog attack={defending} onClose={() => setDefending(null)} />
      <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-mist lg:col-span-2">Feed store: {data.store === "supabase" ? "Supabase Postgres" : "in-memory (configure Supabase for persistence)"}</p>
    </section>
  );
}

function AttackCard({ a, now, onDefend }: { a: AttackView; now: number; onDefend: () => void }) {
  const planet = PLANET_BY_ID[a.bodyId]!;
  const pct = Math.min(100, (a.defensePower / a.effectiveSeverity) * 100);
  const until = a.status === "incoming" ? Date.parse(a.startsAt) - now : Date.parse(a.endsAt) - now;
  return (
    <div id={a.id} className={cn("rounded-sm border p-4 transition", a.status === "active" ? "border-si/35 bg-si/[0.05]" : "border-line bg-void/30")}>
      <div className="flex items-start gap-3">
        <PlanetOrb planet={planet} size={40} speed={50} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{a.kind}</span>
            <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-mist">{planet.name} · {a.sector}</div>
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-1.5 flex justify-between font-mono text-[11px]">
          <span className="text-mist">Defense {a.defensePower} / {a.effectiveSeverity}{a.effectiveSeverity < a.severity && <span className="text-ok"> (sabotaged from {a.severity})</span>}</span>
          <span className="text-mist">{a.defenders} defender{a.defenders === 1 ? "" : "s"}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-line">
          <motion.div className={cn("h-full", pct >= 100 ? "bg-ok" : "bg-ion")} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1 }} />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="font-mono text-xs text-haze">{a.status === "incoming" ? "Starts in" : "Ends in"} {formatCountdown(until)}</span>
        {a.status === "active" && (
          <Button size="sm" variant="si" onClick={onDefend} data-testid="defend-button">
            <ShieldCheck /> Defend
          </Button>
        )}
      </div>
    </div>
  );
}

function DefendDialog({ attack, onClose }: { attack: AttackView | null; onClose: () => void }) {
  const { address } = useAccount();
  const { data: ids } = useMyTerritories();
  const eligible = useMemo(() => (ids ?? []).filter((id) => attack && decodeTokenId(id).bodyId === attack.bodyId), [ids, attack]);
  const { data: stats } = useTerritoryStats(eligible);
  const { signMessageAsync } = useSignMessage();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  async function defend(tokenId: bigint) {
    if (!attack || !address) return;
    setBusy(tokenId.toString());
    try {
      const issuedAt = new Date().toISOString();
      const payload = { attackId: attack.id, tokenId: tokenId.toString(), wallet: address, issuedAt };
      const signature = await signMessageAsync({ message: defenseMessage(payload) });
      const res = await fetch("/api/si/defend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, signature }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Defense rejected");
      toast.success(`Defense committed: +${json.power} power`, { description: plotLabel(tokenId) });
      await qc.invalidateQueries({ queryKey: ["si-feed"] });
    } catch (e) {
      toast.error("Defense failed", { description: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  const planet = attack ? PLANET_BY_ID[attack.bodyId] : undefined;
  return (
    <Dialog open={!!attack} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        {attack && planet && (
          <>
            <DialogTitle>Defend {planet.name}</DialogTitle>
            <DialogDescription>
              {attack.kind} on {attack.sector}. Commit territories you hold on {planet.name}. Power = 10 + 12×level + shield/2. Signing is free — no transaction.
            </DialogDescription>
            <div className="mt-5 flex max-h-80 flex-col gap-2 overflow-auto">
              {!address ? (
                <p className="text-sm text-mist">Connect a wallet first.</p>
              ) : eligible.length === 0 ? (
                <p className="text-sm text-mist">You don&apos;t hold territory on {planet.name}. Claim a plot there to join the defense.</p>
              ) : (
                eligible.map((id, i) => {
                  const s = stats?.[i] as readonly [number, number, bigint] | undefined;
                  const power = 10 + (s ? Number(s[0]) : 0) * 12 + Math.floor((s ? Number(s[1]) : 0) / 2);
                  return (
                    <div key={id.toString()} className="flex items-center justify-between rounded-sm border border-line bg-void/40 px-4 py-3">
                      <div>
                        <div className="text-sm">{plotLabel(id)}</div>
                        <div className="font-mono text-[11px] text-mist">LVL {s ? Number(s[0]) : 0} · SHIELD {s ? Number(s[1]) : 0} · +{power} power</div>
                      </div>
                      <Button size="sm" variant="ion" loading={busy === id.toString()} disabled={!!busy} onClick={() => defend(id)} data-testid="commit-defense">
                        Commit
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
