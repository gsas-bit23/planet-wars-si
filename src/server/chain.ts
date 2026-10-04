import "server-only";
import { createPublicClient, http } from "viem";
import { targetChain } from "@/lib/chains";
import { serverEnv } from "./env";

export const publicClient = createPublicClient({
  chain: targetChain,
  transport: http(serverEnv.rpcUrl || undefined, { batch: true, retryCount: 2, timeout: 15_000 }),
});
