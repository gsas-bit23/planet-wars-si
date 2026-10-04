"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { parseUnits, type Abi } from "viem";
import { Flame, Tag } from "lucide-react";
import { addresses, marketplaceAbi } from "@/lib/contracts";
import { PLANETS, decodeTokenId, plotLabel } from "@/lib/planets";
import { useActiveListings, useMyTerritories, useProtocolStats, usePwsiBalance, useTerritoryStats } from "@/lib/hooks/use-game";
import { useEnsureAllowance, useEnsureOperator, useTx } from "@/lib/hooks/use-tx";
import { formatPWSI } from "@/lib/format";
import { shortAddress, cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stat } from "@/components/ui/stat";
import { Skeleton } from "@/components/ui/skeleton";
import { WalletButton } from "@/components/layout/connect-button";
import { TerritoryCard } from "./territory-card";
import { Empty } from "@/components/ui/empty";

type Sort = "new" | "low" | "high";

export function FeeBreakdown({ price, feeBps }: { price: bigint; feeBps: number }) {
  const fee = (price * BigInt(feeBps)) / 10_000n;
  return (
    <div className="grid gap-2 rounded-sm border border-line bg-void/50 p-4 font-mono text-xs" data-testid="fee-breakdown">
      <div className="flex justify-between"><span className="text-mist">Price</span><span>{formatPWSI(price, { digits: 4 })} PWSI</span></div>
      <div className="flex justify-between"><span className="flex items-center gap-1.5 text-mist"><Flame className="size-3.5 text-solar" />Protocol fee ({feeBps / 100}%) → burned</span><span className="text-solar">{formatPWSI(fee, { digits: 4 })} PWSI</span></div>
      <div className="flex justify-between border-t border-line pt-2"><span className="text-mist">Seller receives</span><span>{formatPWSI(price - fee, { digits: 4 })} PWSI</span></div>
    </div>
  );
}

export function Marketplace() {
  const { address, isConnected } = useAccount();
  const { data: listings, isLoading } = useActiveListings();
  const { data: stats } = useProtocolStats();
  const { data: myIds } = useMyTerritories();
  const { data: balance } = usePwsiBalance();
  const feeBps = stats?.feeBps ?? 100;
  const [planetFilter, setPlanetFilter] = useState<number | 0>(0);
  const [sort, setSort] = useState<Sort>("new");
  const [buying, setBuying] = useState<{ id: bigint; price: bigint; seller: string } | null>(null);
  const [selling, setSelling] = useState<bigint | null>(null);
  const [repricing, setRepricing] = useState<{ id: bigint; price: bigint } | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const { send, pending } = useTx();
  const ensureAllowance = useEnsureAllowance();
  const ensureOperator = useEnsureOperator();

  const all = useMemo(() => {
    const [ids, ls] = listings ?? [[], []];
    return ids.map((id, i) => ({ id, ...ls[i]! }));
  }, [listings]);

  const market = useMemo(() => {
    let l = all.filter((x) => !planetFilter || decodeTokenId(x.id).bodyId === planetFilter);
    if (sort === "low") l = [...l].sort((a, b) => (a.price < b.price ? -1 : 1));
    if (sort === "high") l = [...l].sort((a, b) => (a.price > b.price ? -1 : 1));
    if (sort === "new") l = [...l].sort((a, b) => Number(b.listedAt - a.listedAt));
    return l;
  }, [all, planetFilter, sort]);

  const mine = all.filter((l) => address && l.seller.toLowerCase() === address.toLowerCase());
  const { data: myStats } = useTerritoryStats(myIds);
  const floor = all.length ? all.reduce((m, l) => (l.price < m ? l.price : m), all[0]!.price) : undefined;

  const parsedPrice = (() => {
    try {
      const v = parseUnits(priceInput || "0", 18);
      return v > 0n ? v : null;
    } catch {
      return null;
    }
  })();

  async function buy() {
    if (!buying || !addresses) return;
    await ensureAllowance(addresses.marketplace, buying.price);
    await send(`Buy ${plotLabel(buying.id)}`, {
      address: addresses.marketplace,
      abi: marketplaceAbi as Abi,
      functionName: "buy",
      args: [buying.id, buying.price],
    });
    setBuying(null);
  }

  async function list() {
    if (selling === null || !parsedPrice || !addresses) return;
    await ensureOperator();
    await send(`List ${plotLabel(selling)}`, {
      address: addresses.marketplace,
      abi: marketplaceAbi as Abi,
      functionName: "list",
      args: [selling, parsedPrice],
    });
    setSelling(null);
    setPriceInput("");
  }

  async function reprice() {
    if (!repricing || !parsedPrice || !addresses) return;
    await send(`Update price`, {
      address: addresses.marketplace,
      abi: marketplaceAbi as Abi,
      functionName: "updatePrice",
      args: [repricing.id, parsedPrice],
    });
    setRepricing(null);
    setPriceInput("");
  }

  async function cancel(id: bigint) {
    if (!addresses) return;
    await send(`Cancel listing`, { address: addresses.marketplace, abi: marketplaceAbi as Abi, functionName: "cancel", args: [id] });
  }

  return (
    <section className="mx-auto max-w-[1400px] px-5 py-10 md:px-8">
      <div className="mb-10 grid grid-cols-2 gap-6 rounded-md border border-line bg-hull/40 p-6 md:grid-cols-5">
        <Stat label="Active listings" value={all.length} />
        <Stat label="Floor" value={floor !== undefined ? `${formatPWSI(floor)}` : "—"} sub="PWSI" />
        <Stat label="Volume" value={formatPWSI(stats?.volume, { compact: true })} sub="PWSI all-time" />
        <Stat label="Trades" value={stats ? Number(stats.trades) : "—"} />
        <Stat label="Fees burned" value={formatPWSI(stats?.feeBurned)} sub={`${feeBps / 100}% of every sale`} tone="solar" />
      </div>

      <Tabs defaultValue="buy">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="buy">Buy</TabsTrigger>
            <TabsTrigger value="sell" data-testid="tab-sell">Sell</TabsTrigger>
            <TabsTrigger value="mine">My listings {mine.length ? `(${mine.length})` : ""}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="buy">
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <button onClick={() => setPlanetFilter(0)} className={cn("rounded-xs border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition", planetFilter === 0 ? "border-ink text-ink" : "border-line text-mist hover:text-ink")}>All</button>
            {PLANETS.map((p) => (
              <button key={p.slug} onClick={() => setPlanetFilter(p.bodyId)} className={cn("rounded-xs border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition", planetFilter === p.bodyId ? "border-ink text-ink" : "border-line text-mist hover:text-ink")}>
                {p.name}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1 rounded-sm border border-line p-1">
              {(["new", "low", "high"] as Sort[]).map((s) => (
                <button key={s} onClick={() => setSort(s)} className={cn("rounded-xs px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em]", sort === s ? "bg-white/[0.07] text-ink" : "text-mist")}>
                  {s === "new" ? "Newest" : s === "low" ? "Price ↑" : "Price ↓"}
                </button>
              ))}
            </div>
          </div>
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-44" />)}</div>
          ) : market.length === 0 ? (
            <Empty title="No listings yet" body="Be the first to list a territory — or claim fresh plots straight from a planet grid." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="listings">
              {market.map((l) => {
                const own = address && l.seller.toLowerCase() === address.toLowerCase();
                return (
                  <TerritoryCard
                    key={l.id.toString()}
                    tokenId={l.id}
                    footer={
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-display text-xl font-bold tabular-nums">{formatPWSI(l.price)} <span className="font-mono text-xs font-normal text-mist">PWSI</span></div>
                          <div className="font-mono text-[10.5px] text-mist">by {own ? "you" : shortAddress(l.seller)}</div>
                        </div>
                        <Button size="sm" variant={own ? "outline" : "primary"} disabled={!!own || !isConnected} onClick={() => setBuying({ id: l.id, price: l.price, seller: l.seller })} data-testid="buy-button">
                          {own ? "Yours" : "Buy"}
                        </Button>
                      </div>
                    }
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sell">
          {!isConnected ? (
            <Empty title="Connect to sell" body="Your territories appear here once your wallet is connected." action={<WalletButton />} />
          ) : !myIds?.length ? (
            <Empty title="No territories in wallet" body="Claim plots from any planet grid, then list them here." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {myIds.map((id, i) => {
                const s = myStats?.[i] as readonly [number, number, bigint] | undefined;
                return (
                  <TerritoryCard
                    key={id.toString()}
                    tokenId={id}
                    level={s ? Number(s[0]) : undefined}
                    shield={s ? Number(s[1]) : undefined}
                    footer={
                      <Button size="sm" variant="ion" className="w-full" onClick={() => { setSelling(id); setPriceInput(""); }} data-testid="list-button">
                        <Tag /> List for sale
                      </Button>
                    }
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="mine">
          {mine.length === 0 ? (
            <Empty title="No active listings" body="Listed territories are held in escrow by the marketplace contract until sold or cancelled." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {mine.map((l) => (
                <TerritoryCard
                  key={l.id.toString()}
                  tokenId={l.id}
                  footer={
                    <div className="flex flex-col gap-3">
                      <div className="font-display text-xl font-bold tabular-nums">{formatPWSI(l.price)} <span className="font-mono text-xs font-normal text-mist">PWSI</span></div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setRepricing({ id: l.id, price: l.price }); setPriceInput(""); }}>Reprice</Button>
                        <Button size="sm" variant="ghost" loading={pending === "Cancel listing"} onClick={() => cancel(l.id)}>Cancel</Button>
                      </div>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!buying} onOpenChange={(o) => !o && setBuying(null)}>
        <DialogContent>
          {buying && (
            <>
              <DialogTitle>Buy {plotLabel(buying.id)}</DialogTitle>
              <DialogDescription>Seller {shortAddress(buying.seller)}. The territory transfers to your wallet on confirmation.</DialogDescription>
              <div className="mt-5"><FeeBreakdown price={buying.price} feeBps={feeBps} /></div>
              <div className="mt-3 flex justify-between font-mono text-xs"><span className="text-mist">Your balance</span><span className={balance !== undefined && balance < buying.price ? "text-si" : ""}>{formatPWSI(balance)} PWSI</span></div>
              <Button className="mt-5 w-full" size="lg" loading={pending !== null} disabled={balance !== undefined && balance < buying.price} onClick={buy} data-testid="confirm-buy">
                Buy for {formatPWSI(buying.price)} PWSI
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={selling !== null || !!repricing} onOpenChange={(o) => { if (!o) { setSelling(null); setRepricing(null); } }}>
        <DialogContent>
          {(selling !== null || repricing) && (
            <>
              <DialogTitle>{repricing ? "Update price" : "List territory"}</DialogTitle>
              <DialogDescription>{plotLabel((selling ?? repricing!.id) as bigint)}{repricing ? ` · currently ${formatPWSI(repricing.price)} PWSI` : ""}</DialogDescription>
              <label className="mt-5 block font-mono text-[11px] uppercase tracking-[0.14em] text-mist" htmlFor="price">Asking price (PWSI)</label>
              <Input id="price" className="mt-2" inputMode="decimal" placeholder="e.g. 250" value={priceInput} onChange={(e) => setPriceInput(e.target.value.replace(/[^0-9.]/g, ""))} data-testid="price-input" />
              {parsedPrice && <div className="mt-4"><FeeBreakdown price={parsedPrice} feeBps={feeBps} /></div>}
              <Button className="mt-5 w-full" size="lg" loading={pending !== null} disabled={!parsedPrice || parsedPrice < 10n ** 15n} onClick={repricing ? reprice : list} data-testid="confirm-list">
                {repricing ? "Update price" : "Approve & list"}
              </Button>
              {!repricing && <p className="mt-3 text-center text-xs text-mist">Listing escrows the plot in the marketplace. Cancel any time to get it back.</p>}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
