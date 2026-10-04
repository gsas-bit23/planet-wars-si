import "server-only";

/** Server-side configuration. Every value is optional; the app degrades gracefully. */
export const serverEnv = {
  supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  cronSecret: process.env.CRON_SECRET || "",
  siSeed: process.env.SI_SEED || "planet-wars-si/overmind/v1",
  llm: {
    apiKey: process.env.SI_LLM_API_KEY || "",
    baseUrl: (process.env.SI_LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.SI_LLM_MODEL || "gpt-4o-mini",
  },
  rpcUrl: process.env.RPC_URL || "",
};

export const hasSupabase = Boolean(serverEnv.supabaseUrl && serverEnv.supabaseServiceKey);
