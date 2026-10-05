#!/usr/bin/env node
/**
 * Minimal Vercel REST helper for production env vars and deployments. Secret values are read
 * from *environment variables* (never argv), and are never printed.
 *
 *   VERCEL_TOKEN=... node scripts/vercel-env.mjs list
 *   node scripts/vercel-env.mjs set KEY FROM_ENV_VAR [sensitive|plain|encrypted]   # upsert (production)
 *   node scripts/vercel-env.mjs rm KEY                                             # delete (production)
 *   node scripts/vercel-env.mjs wait <git-sha> [timeoutSec]                        # wait for READY
 *
 * Env: VERCEL_TOKEN (required), VERCEL_TEAM_ID, VERCEL_PROJECT_ID, VERCEL_ENV_TARGET (default production).
 */
const token = process.env.VERCEL_TOKEN;
if (!token) { console.error("VERCEL_TOKEN is not set"); process.exit(2); }
const team = process.env.VERCEL_TEAM_ID || "team_MzxAombFDlUoo9Vz6J0DPLAp";
const project = process.env.VERCEL_PROJECT_ID || "prj_qkEQodXUKIwaofcBiWDD3ABRm9hW";
const target = process.env.VERCEL_ENV_TARGET || "production";
const api = async (method, path, body) => {
  const sep = path.includes("?") ? "&" : "?";
  const r = await fetch(`https://api.vercel.com${path}${sep}teamId=${team}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path.split("?")[0]} → ${r.status} ${j?.error?.message ?? ""}`);
  return j;
};
const envs = async () => (await api("GET", `/v10/projects/${project}/env`)).envs ?? [];
const forTarget = (e) => (e.target ?? []).includes(target);

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "list") {
  for (const e of await envs()) console.log(`${e.key.padEnd(40)} ${e.type.padEnd(10)} ${(e.target ?? []).join(",")}`);
} else if (cmd === "set") {
  const [key, from, type = "plain"] = args;
  const value = process.env[from];
  if (!key || !from || value === undefined || value === "") { console.error(`set ${key}: env var ${from} is empty`); process.exit(2); }
  const existing = (await envs()).filter((e) => e.key === key && forTarget(e));
  for (const e of existing) {
    if (e.type === type && (e.target ?? []).length === 1) {
      await api("PATCH", `/v9/projects/${project}/env/${e.id}`, { value, type });
      console.log(`updated ${key} (${type}, ${target})`);
      process.exit(0);
    }
  }
  // Type changes (e.g. plain → sensitive) or shared targets: replace the production entry.
  for (const e of existing) {
    const rest = (e.target ?? []).filter((t) => t !== target);
    if (rest.length) await api("PATCH", `/v9/projects/${project}/env/${e.id}`, { target: rest });
    else await api("DELETE", `/v9/projects/${project}/env/${e.id}`);
  }
  await api("POST", `/v10/projects/${project}/env`, { key, value, type, target: [target] });
  console.log(`created ${key} (${type}, ${target})`);
} else if (cmd === "rm") {
  const [key] = args;
  let n = 0;
  for (const e of (await envs()).filter((e) => e.key === key && forTarget(e))) {
    const rest = (e.target ?? []).filter((t) => t !== target);
    if (rest.length) await api("PATCH", `/v9/projects/${project}/env/${e.id}`, { target: rest });
    else await api("DELETE", `/v9/projects/${project}/env/${e.id}`);
    n++;
  }
  console.log(`removed ${key} from ${target} (${n} entr${n === 1 ? "y" : "ies"})`);
} else if (cmd === "wait") {
  const [sha, timeout = "900"] = args;
  const deadline = Date.now() + Number(timeout) * 1000;
  for (;;) {
    const { deployments = [] } = await api("GET", `/v6/deployments?projectId=${project}&limit=10&target=production`);
    const d = deployments.find((x) => !sha || x.meta?.githubCommitSha?.startsWith(sha));
    const state = d?.state ?? d?.readyState;
    if (d) console.log(`deployment ${d.uid} ${state}`);
    if (state === "READY") process.exit(0);
    if (state === "ERROR" || state === "CANCELED") process.exit(1);
    if (Date.now() > deadline) { console.error("timed out waiting for the deployment"); process.exit(1); }
    await new Promise((r) => setTimeout(r, 10000));
  }
} else {
  console.error("usage: vercel-env.mjs list | set KEY FROM_ENV [type] | rm KEY | wait <sha> [timeoutSec]");
  process.exit(2);
}
