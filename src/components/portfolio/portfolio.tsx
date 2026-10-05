"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { parseUnits, type Abi } from "viem";
import { ArrowUpCircle, Shield } from "lucide-react";
import { addresses, opsAbi } from "@/lib/contracts";
import { getPwsiLink } from "@/lib/contracts";
import { PLANET_BY_ID, decodeTokenId, plotLabel } from "@/lib/planets";
import { useActiveListings, useMyTerritories, usePwsiBalance, useTerritoryStats } from "@/lib/hooks/use-game";
import { useEnsureAllowance, useTx } from "@/lib/hooks/use-tx";
import { formatPWSI } from "@/lib/format";
import { Stat } from "@/components/ui/stat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { WalletButton } from "@/components/layout/connect-button";
import { TerritoryCard } from "@/components/market/territory-card";

const SHIELD_UNIT = 2;
const UPGRADE_BASE = 50;

export function Portfolio() {
  const { address, isConnected } = useAccount();
  const { data: balance } = usePwsiBalance();
  const { data: ids, isLoading } = useMyTerritories();
  const { data: stats } = useTerritoryStats(ids);
  const { data: listings } = useActiveListings();
  const { send, pending } = useTx();
  const ensureAllowance = useEnsureAllowance();
  const [shieldFor, setShieldFor] = useState<bigint | null>(null);
  const [units, setUnits] = useState("25");

  const rows = useMemo(
    () =>
      (ids ?? []).map((id, i) => {
        const s = stats?.[i] as readonly [number, number, bigint] | undefined;
        return { id, level: s ? Number(s[0]) : 0, shield: s ? Number(s[1]) : 0, nextCost: s ? s[2] : parseUnits(String(UPGRADE_BASE), 18) };
      }),
    [ids, stats],
  );
  const myListings = useMemo(() => {
    const [lids, ls] = listings ?? [[], []];
    return lids.filter((_, i) => address && ls[i]!.seller.toLowerCase() === address.toLowerCase());
  }, [listings, address]);

  const byPlanet = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of rows) m.set(decodeTokenId(r.id).bodyId, (m.get(decodeTokenId(r.id).bodyId) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  async function upgrade(id: bigint, cost: bigint) {
    if (!addresses) return;
    await ensureAllowance(addresses.ops, cost);
    await send(`Upgrade ${plotLabel(id)}`, { address: addresses.ops, abi: opsAbi as Abi, functionName: "upgrade", args: [id] });
  }

  async function shield() {
    if (!addresses || shieldFor === null) return;
    const n = Math.max(1, Math.min(1000, Number(units) || 0));
    await ensureAllowance(addresses.ops, parseUnits(String(n * SHIELD_UNIT), 18));
    await send(`Build ${n} shield units`, { address: addresses.ops, abi: opsAbi as Abi, functionName: "buildShield", args: [shieldFor, n] });
    setShieldFor(null);
  }

  if (!isConnected)
    return (
      <section className="mx-auto max-w-[1400px] px-5 py-12 md:px-8">
        <Empty title="Connect your wallet" body="Your territories, upgrades and PWSI balance live on-chain. Connect to see them." action={<WalletButton />} />
      </section>
    );

  const totalLevels = rows.reduce((a, r) => a + r.level, 0);
  const totalShield = rows.reduce((a, r) => a + r.shield, 0);

  return (
    <section className="mx-auto max-w-[1400px] px-5 py-10 md:px-8">
      <div className="mb-10 grid grid-cols-2 gap-6 rounded-md border border-line bg-hull/40 p-6 md:grid-cols-5">
        <Stat label="PWSI balance" value={formatPWSI(balance)} tone="ion" sub={getPwsiLink ? <Link href={getPwsiLink.href} className="hover:text-ink">{getPwsiLink.external ? "Get PWSI →" : "Top up at faucet →"}</Link> : undefined} />
        <Stat label="Territories" value={rows.length} sub={`${myListings.length} listed on market`} />
        <Stat label="Worlds held" value={byPlanet.length} sub={byPlanet.map(([b]) => PLANET_BY_ID[b]?.name).slice(0, 3).join(", ") || "—"} />
        <Stat label="Total levels" value={totalLevels} />
        <Stat label="Shield units" value={totalShield} />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-52" />)}</div>
      ) : rows.length === 0 ? (
        <Empty title="No territories yet" body="Claim plots from a planet grid or buy them on the marketplace." action={<Button asChild><Link href="/planets">Explore planets</Link></Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="portfolio-grid">
          {rows.map((r) => (
            <TerritoryCard
              key={r.id.toString()}
              tokenId={r.id}
              level={r.level}
              shield={r.shield}
              footer={
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="ion" disabled={r.level >= 10 || pending !== null} onClick={() => upgrade(r.id, r.nextCost)} title={`Costs ${formatPWSI(r.nextCost)} PWSI (10% burned, 90% to rewards)`} aria-label={r.level >= 10 ? "Max level" : `Upgrade to level ${r.level + 1} for ${formatPWSI(r.nextCost)} PWSI`}>
                    <ArrowUpCircle /> {r.level >= 10 ? "Max" : `${formatPWSI(r.nextCost)}`}
                  </Button>
                  <Button size="sm" variant="outline" disabled={r.shield >= 1000 || pending !== null} onClick={() => setShieldFor(r.id)}>
                    <Shield /> Shield
                  </Button>
                </div>
              }
            />
          ))}
        </div>
      )}

      {myListings.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-4 font-display text-2xl font-bold tracking-tight">Listed on the market</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {myListings.map((id) => (
              <TerritoryCard key={id.toString()} tokenId={id} footer={<Button asChild size="sm" variant="outline" className="w-full"><Link href="/marketplace">Manage listing</Link></Button>} />
            ))}
          </div>
        </div>
      )}

      <Dialog open={shieldFor !== null} onOpenChange={(o) => !o && setShieldFor(null)}>
        <DialogContent>
          <DialogTitle>Build shields</DialogTitle>
          <DialogDescription>{shieldFor !== null && plotLabel(shieldFor)} · {SHIELD_UNIT} PWSI per unit (10% burned, 90% to the reward pool). Shields add defense power against SI attacks.</DialogDescription>
          <Input className="mt-5" inputMode="numeric" value={units} onChange={(e) => setUnits(e.target.value.replace(/\D/g, ""))} />
          <div className="mt-3 flex justify-between font-mono text-xs"><span className="text-mist">Cost</span><span className="text-solar">{(Number(units) || 0) * SHIELD_UNIT} PWSI</span></div>
          <Button className="mt-5 w-full" size="lg" loading={pending !== null} disabled={!Number(units)} onClick={shield}>Build {units || 0} units</Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
