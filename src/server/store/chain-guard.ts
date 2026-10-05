import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TARGET_CHAIN_ID } from "@/lib/chains";

/**
 * One Supabase project serves exactly one chain. Rounds, epochs, scores and SI defenses are keyed
 * by day / round / token id, which collide across chains, so a testnet database must never be
 * reused for mainnet. The first server that talks to an empty project stamps its chain id into
 * `app_meta`; any later deployment configured for a different chain refuses to read or write.
 * (If the `app_meta` table does not exist yet, the guard is skipped with a warning.)
 */
let checked: Promise<void> | null = null;

export function assertStoreChain(client: SupabaseClient): Promise<void> {
  checked ??= (async () => {
    const want = String(TARGET_CHAIN_ID);
    const { data, error } = await client.from("app_meta").select("value").eq("key", "chain_id").limit(1);
    if (error) {
      if (/app_meta/.test(error.message)) {
        console.warn("[store] app_meta table missing; chain guard skipped. Apply supabase/migrations.");
        return;
      }
      throw new Error(`store chain guard: ${error.message}`);
    }
    const have = data?.[0]?.value as string | undefined;
    if (have === undefined) {
      const ins = await client.from("app_meta").insert({ key: "chain_id", value: want });
      if (ins.error && !/duplicate/i.test(ins.error.message)) throw new Error(`store chain guard: ${ins.error.message}`);
      if (ins.error) return assertStoreChainRecheck(client, want);
      return;
    }
    if (have !== want) {
      throw new Error(
        `Supabase project belongs to chain ${have}, but this deployment targets chain ${want}. Use a separate Supabase project per chain.`,
      );
    }
  })().catch((e) => {
    checked = null; // retry on the next request (e.g. transient network error)
    throw e;
  });
  return checked;
}

async function assertStoreChainRecheck(client: SupabaseClient, want: string) {
  const { data } = await client.from("app_meta").select("value").eq("key", "chain_id").limit(1);
  const have = data?.[0]?.value as string | undefined;
  if (have !== want) throw new Error(`Supabase project belongs to chain ${have}, not ${want}.`);
}
