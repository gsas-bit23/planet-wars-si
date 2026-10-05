#!/usr/bin/env bash
# Planet Wars SI: one-command mainnet launch on Robinhood Chain (4663).
#
#   TOKEN_ADDRESS=0x… scripts/launch-mainnet.sh                       # real launch (asks to confirm)
#   DRY_RUN=1 FORK_RPC=http://127.0.0.1:8547 TOKEN_ADDRESS=0x… scripts/launch-mainnet.sh
#
# Steps: validate token → derive + fund-check wallets → simulate → deploy (--broadcast, Blockscout
# verify) → contracts:sync → preflight → Vercel env → commit + push (auto-deploy) → wait READY →
# verify live /api/health.
# DRY_RUN=1 runs every step against an anvil MAINNET FORK (FORK_RPC), skips verification, Vercel,
# git and live checks (they are printed instead), and removes every artifact afterwards.
#
# Required env: TOKEN_ADDRESS, MAINNET_DEPLOYER_PRIVATE_KEY, MAINNET_OPERATOR_PRIVATE_KEY,
#               VERCEL_TOKEN (real run). CRON_SECRET / LOTTERY_SECRET are read from
#               $MAINNET_ENV_FILE (default ~/.planet-wars-si.mainnet.env) when not already set.
# Optional:     ADMIN_ADDRESS (Safe; roles handed over), BURN_MODE (auto|burn|dead, default auto),
#               TOKEN_BUY_URL (pons page → NEXT_PUBLIC_TOKEN_BUY_URL), SITE_URL (https://pwsi.site),
#               YES=1 (skip the confirmation prompt), MIN_DEPLOYER_ETH (0.0008), MIN_OPERATOR_ETH (0.0005).
# Keys are only ever passed through the environment; nothing secret is printed or put in argv.
set -euo pipefail
set +x

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.foundry/bin:$PATH"

CHAIN_ID=4663
MAINNET_RPC="https://rpc.mainnet.chain.robinhood.com"
BLOCKSCOUT_API="https://robinhoodchain.blockscout.com/api/"
SITE_URL="${SITE_URL:-https://pwsi.site}"
LIVE_URL="${LIVE_URL:-https://www.pwsi.site}"
DRY_RUN="${DRY_RUN:-0}"
BURN_MODE="${BURN_MODE:-auto}"
MIN_DEPLOYER_ETH="${MIN_DEPLOYER_ETH:-0.0008}"
MIN_OPERATOR_ETH="${MIN_OPERATOR_ETH:-0.0005}"
MAINNET_ENV_FILE="${MAINNET_ENV_FILE:-$HOME/.planet-wars-si.mainnet.env}"

say()  { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mOK\033[0m   %s\n' "$*"; }
info() { printf '  ..   %s\n' "$*"; }
die()  { printf '  \033[31mFAIL\033[0m %s\n' "$*" >&2; exit 1; }
plan() { printf '  \033[33mDRY\033[0m  would run: %s\n' "$*"; }

# Secrets file (CRON_SECRET, LOTTERY_SECRET, optional SUPABASE_*) without overriding the caller.
if [[ -f "$MAINNET_ENV_FILE" ]]; then
  while IFS='=' read -r k v; do
    [[ -z "$k" || "$k" == \#* ]] && continue
    [[ -z "${!k:-}" ]] && export "$k=$v"
  done < "$MAINNET_ENV_FILE"
fi

# ───────────────────────────── 0. RPC ─────────────────────────────
if [[ "$DRY_RUN" == "1" ]]; then
  [[ -n "${FORK_RPC:-}" ]] || die "DRY_RUN=1 needs FORK_RPC (anvil --fork-url $MAINNET_RPC)"
  RPC="$FORK_RPC"
  say "DRY RUN against fork $RPC (nothing is sent to mainnet)"
else
  RPC="${RPC_URL:-$MAINNET_RPC}"
  say "LIVE LAUNCH on Robinhood Chain mainnet via $RPC"
fi
got_chain="$(cast chain-id --rpc-url "$RPC")"
[[ "$got_chain" == "$CHAIN_ID" ]] || die "RPC chain id is $got_chain, expected $CHAIN_ID"
ok "RPC chain id $got_chain, block $(cast block-number --rpc-url "$RPC")"
if [[ "$DRY_RUN" != "1" ]] && cast rpc anvil_nodeInfo --rpc-url "$RPC" >/dev/null 2>&1; then
  die "RPC answers anvil_* methods; refusing a 'live' launch against a fork (use DRY_RUN=1)"
fi

# ───────────────────────────── 1. Token ─────────────────────────────
say "1. Token"
[[ "${TOKEN_ADDRESS:-}" =~ ^0x[0-9a-fA-F]{40}$ ]] || die "TOKEN_ADDRESS is missing or malformed"
TOKEN_ADDRESS="$(cast to-check-sum-address "$TOKEN_ADDRESS")"
[[ "$(cast code "$TOKEN_ADDRESS" --rpc-url "$RPC")" != "0x" ]] || die "no contract code at $TOKEN_ADDRESS"
decimals="$(cast call "$TOKEN_ADDRESS" 'decimals()(uint8)' --rpc-url "$RPC")"
[[ "$decimals" == "18" ]] || die "token has $decimals decimals; the game requires 18"
symbol="$(cast call "$TOKEN_ADDRESS" 'symbol()(string)' --rpc-url "$RPC" | tr -d '"')"
name="$(cast call "$TOKEN_ADDRESS" 'name()(string)' --rpc-url "$RPC" | tr -d '"')"
supply="$(cast call "$TOKEN_ADDRESS" 'totalSupply()(uint256)' --rpc-url "$RPC" | awk '{print $1}')"
ok "$name ($symbol) at $TOKEN_ADDRESS · 18 decimals · supply $(cast from-wei "$supply") "
[[ "$symbol" == "PWSI" ]] || info "note: symbol is '$symbol' (expected PWSI for the real launch)"

# ───────────────────────────── 2. Wallets ─────────────────────────────
say "2. Wallets"
[[ -n "${MAINNET_DEPLOYER_PRIVATE_KEY:-}" ]] || die "MAINNET_DEPLOYER_PRIVATE_KEY is not set"
[[ -n "${MAINNET_OPERATOR_PRIVATE_KEY:-}" ]] || die "MAINNET_OPERATOR_PRIVATE_KEY is not set"
addr_of() { KEY_ENV="$1" node --input-type=module -e '
  import { privateKeyToAccount } from "viem/accounts";
  const k = process.env[process.env.KEY_ENV].trim();
  console.log(privateKeyToAccount(k.startsWith("0x") ? k : `0x${k}`).address);'; }
DEPLOYER="$(addr_of MAINNET_DEPLOYER_PRIVATE_KEY)"
OPERATOR="$(addr_of MAINNET_OPERATOR_PRIVATE_KEY)"
[[ "$DEPLOYER" != "$OPERATOR" ]] || die "deployer and operator must be different wallets"
[[ -z "${MAINNET_DEPLOYER_ADDRESS:-}" || "${MAINNET_DEPLOYER_ADDRESS,,}" == "${DEPLOYER,,}" ]] || die "deployer key does not match MAINNET_DEPLOYER_ADDRESS"
[[ -z "${MAINNET_OPERATOR_ADDRESS:-}" || "${MAINNET_OPERATOR_ADDRESS,,}" == "${OPERATOR,,}" ]] || die "operator key does not match MAINNET_OPERATOR_ADDRESS"
bal() { cast from-wei "$(cast balance "$1" --rpc-url "$RPC")"; }
dbal="$(bal "$DEPLOYER")"; obal="$(bal "$OPERATOR")"
info "deployer $DEPLOYER  balance $dbal ETH  nonce $(cast nonce "$DEPLOYER" --rpc-url "$RPC")"
info "operator $OPERATOR  balance $obal ETH  nonce $(cast nonce "$OPERATOR" --rpc-url "$RPC")"
awk -v b="$dbal" -v m="$MIN_DEPLOYER_ETH" 'BEGIN{exit !(b>=m)}' || die "deployer needs ≥ $MIN_DEPLOYER_ETH ETH (deploy ≈ 0.00025 ETH at 0.02 gwei)"
awk -v b="$obal" -v m="$MIN_OPERATOR_ETH" 'BEGIN{exit !(b>=m)}' || die "operator needs ≥ $MIN_OPERATOR_ETH ETH for daily publishing"
ok "balances above minimums"
for v in CRON_SECRET LOTTERY_SECRET; do [[ -n "${!v:-}" ]] || die "$v is not set (see $MAINNET_ENV_FILE)"; done
ok "CRON_SECRET / LOTTERY_SECRET present (not printed)"
if [[ -n "${ADMIN_ADDRESS:-}" ]]; then
  [[ "$(cast code "$ADMIN_ADDRESS" --rpc-url "$RPC")" != "0x" ]] || die "ADMIN_ADDRESS has no code (must be a Safe)"
  ok "admin Safe $ADMIN_ADDRESS (roles handed over at deploy; Safe must acceptOwnership afterwards)"
else
  info "no ADMIN_ADDRESS: the deployer stays admin (hand over to a Safe later)"
fi

# Burn mode: V2 pons tokens expose burn(uint256); V1 do not.
if cast call "$TOKEN_ADDRESS" 'burn(uint256)' 0 --from "$DEPLOYER" --rpc-url "$RPC" >/dev/null 2>&1; then has_burn=1; else has_burn=0; fi
case "$BURN_MODE" in
  auto) BURN_MODE=$([[ $has_burn == 1 ]] && echo burn || echo dead) ;;
  burn) [[ $has_burn == 1 ]] || die "BURN_MODE=burn but the token has no working burn(uint256)" ;;
  dead) ;;
  *) die "BURN_MODE must be auto|burn|dead" ;;
esac
ok "burn() $([[ $has_burn == 1 ]] && echo present || echo absent) → BURN_MODE=$BURN_MODE"

# ───────────────────────────── 3. Deploy ─────────────────────────────
DEPLOY_JSON="contracts/deployments/$CHAIN_ID.json"
BROADCAST_DIR="contracts/broadcast/DeployMainnet.s.sol/$CHAIN_ID"
[[ ! -f "$DEPLOY_JSON" ]] || die "$DEPLOY_JSON already exists; refusing to deploy twice"
if [[ "$DRY_RUN" == "1" ]]; then
  backup="$(mktemp -d)"
  cp src/lib/generated/deployments.json src/lib/generated/abis.ts "$backup/"
  cleanup() {
    cp "$backup/deployments.json" "$backup/abis.ts" src/lib/generated/
    rm -rf "$DEPLOY_JSON" "$BROADCAST_DIR" "contracts/cache/DeployMainnet.s.sol/$CHAIN_ID" "$backup"
    node scripts/select-network.mjs >/dev/null 2>&1 || true
    info "dry-run artifacts removed; generated files restored"
  }
  trap cleanup EXIT
fi

# Keys go through exported env in a subshell (never argv, so they don't show in `ps`).
run_forge() (
  cd contracts
  export DEPLOYER_PRIVATE_KEY="$MAINNET_DEPLOYER_PRIVATE_KEY"
  export TOKEN_ADDRESS OPERATOR_ADDRESS="$OPERATOR" BURN_MODE
  export METADATA_BASE_URI="$SITE_URL/api/metadata/" CONTRACT_URI="$SITE_URL/api/metadata/contract"
  export ADMIN_ADDRESS="${ADMIN_ADDRESS:-0x0000000000000000000000000000000000000000}"
  forge script script/DeployMainnet.s.sol --rpc-url "$RPC" --slow "$@"
)
say "3a. Simulate DeployMainnet (no broadcast)"
run_forge > /tmp/pwsi-launch-sim.log 2>&1 \
  || { tail -30 /tmp/pwsi-launch-sim.log; die "simulation failed (log: /tmp/pwsi-launch-sim.log)"; }
grep -E "Estimated total gas|Estimated amount required" /tmp/pwsi-launch-sim.log | sed 's/^/  ..   /' || true
rm -f "$DEPLOY_JSON"   # the simulation also writes the record; the broadcast below rewrites it
ok "simulation passed"

if [[ "$DRY_RUN" != "1" && "${YES:-0}" != "1" ]]; then
  read -r -p "  Broadcast the deployment to MAINNET from $DEPLOYER? Type 'launch' to continue: " answer
  [[ "$answer" == "launch" ]] || die "aborted by user"
fi
say "3b. Deploy (--broadcast$([[ $DRY_RUN == 1 ]] && echo ' to the fork' || echo ', Blockscout verification'))"
verify=()
[[ "$DRY_RUN" == "1" ]] || verify=(--verify --verifier blockscout --verifier-url "$BLOCKSCOUT_API")
run_forge --broadcast "${verify[@]}" > /tmp/pwsi-launch-deploy.log 2>&1 \
  || { tail -40 /tmp/pwsi-launch-deploy.log; die "deployment failed (log: /tmp/pwsi-launch-deploy.log)"; }
[[ -f "$DEPLOY_JSON" ]] || die "deployment record $DEPLOY_JSON missing"
ok "deployed: $(grep -c '"hash"' "$BROADCAST_DIR/run-latest.json" 2>/dev/null || echo '?') broadcast entries"
node -e 'const d=require(process.argv[1]);for(const k of ["token","treasury","rewardPool","dailyDraw","territory","marketplace","ops"])console.log(`  ..   ${k.padEnd(12)} ${d[k]}`)' "$ROOT/$DEPLOY_JSON"

# ───────────────────────────── 4. Sync + preflight ─────────────────────────────
say "4. Sync into the web app + preflight"
npm run --silent contracts:sync
NEXT_PUBLIC_CHAIN_ID=$CHAIN_ID node scripts/select-network.mjs | grep -q "deployment found" || die "select-network did not pick up the 4663 deployment"
ok "src/lib/generated/deployments.json now has chain $CHAIN_ID"
CHAIN_ID=$CHAIN_ID RPC_URL="$RPC" ADMIN_ADDRESS="${ADMIN_ADDRESS:-}" SITE_URL="$SITE_URL" HEALTH_URL="$LIVE_URL" node scripts/preflight-mainnet.mjs \
  || die "preflight failed; do not switch the site"
ok "preflight passed"

# ───────────────────────────── 5. Vercel env ─────────────────────────────
say "5. Vercel production env"
vset() { if [[ "$DRY_RUN" == "1" ]]; then plan "vercel-env set $1 (from \$$2, $3)"; else node scripts/vercel-env.mjs set "$1" "$2" "$3"; fi; }
export PWSI_CHAIN_ID="$CHAIN_ID"
vset NEXT_PUBLIC_CHAIN_ID PWSI_CHAIN_ID plain
vset OPERATOR_PRIVATE_KEY MAINNET_OPERATOR_PRIVATE_KEY sensitive
vset LOTTERY_SECRET LOTTERY_SECRET sensitive
vset CRON_SECRET CRON_SECRET sensitive
[[ -n "${TOKEN_BUY_URL:-}" ]] && vset NEXT_PUBLIC_TOKEN_BUY_URL TOKEN_BUY_URL plain
# Mainnet DB is its own project; never take SUPABASE_URL from the ambient env (that may be testnet).
MAINNET_SUPABASE_URL="${MAINNET_SUPABASE_URL:-https://sdrtbjwbxgzpdbpskyup.supabase.co}"
if [[ -n "${SUPABASE_SERVICE_ROLE_KEY_MAINNET:-}" ]]; then
  # The key must belong to the mainnet project and the project must be stamped chain 4663.
  stamp="$(curl -s "$MAINNET_SUPABASE_URL/rest/v1/app_meta?select=value&key=eq.chain_id" \
    -H @<(printf 'apikey: %s\n' "$SUPABASE_SERVICE_ROLE_KEY_MAINNET") || true)"
  [[ "$stamp" == '[{"value":"4663"}]' ]] || die "SUPABASE_SERVICE_ROLE_KEY_MAINNET is not valid for $MAINNET_SUPABASE_URL (or app_meta is not stamped 4663)"
  ok "Supabase mainnet key valid; app_meta.chain_id = 4663"
  export PWSI_SUPABASE_URL="$MAINNET_SUPABASE_URL"
  vset SUPABASE_URL PWSI_SUPABASE_URL encrypted
  vset SUPABASE_SERVICE_ROLE_KEY SUPABASE_SERVICE_ROLE_KEY_MAINNET sensitive
else
  info "SUPABASE_SERVICE_ROLE_KEY_MAINNET not set: production keeps its current store setting"
fi

# ───────────────────────────── 6. Commit + push → deploy ─────────────────────────────
say "6. Commit + push (Vercel auto-deploys main)"
files=(src/lib/generated/deployments.json src/lib/generated/abis.ts "$DEPLOY_JSON" "$BROADCAST_DIR/run-latest.json")
if [[ "$DRY_RUN" == "1" ]]; then
  plan "git add ${files[*]} && git commit -m 'Launch on Robinhood Chain mainnet' && git push origin main"
  plan "node scripts/vercel-env.mjs wait <sha> && curl $LIVE_URL/api/health (expect chain 4663, contractsDeployed, faucet false)"
  say "DRY RUN complete: every step passed; nothing was sent to mainnet"
  exit 0
fi
git add "${files[@]}"
git commit -m "Launch on Robinhood Chain mainnet ($symbol $TOKEN_ADDRESS)"
git push origin main
sha="$(git rev-parse HEAD)"
ok "pushed $sha"

say "7. Wait for the Vercel production deployment"
node scripts/vercel-env.mjs wait "$sha" 1200 || die "deployment did not become READY"

say "8. Verify live"
health="$(curl -fsS "$LIVE_URL/api/health")"
HEALTH="$health" node -e '
  const h = JSON.parse(process.env.HEALTH);
  const bad = [];
  if (h.chain?.id !== 4663) bad.push(`chain ${h.chain?.id}`);
  if (!h.chain?.rpcMatches) bad.push("rpc mismatch");
  if (!h.contractsDeployed) bad.push("contracts not deployed");
  if (h.faucet) bad.push("faucet present");
  if (bad.length) { console.error("  FAIL live health: " + bad.join(", ")); process.exit(1); }
  console.log(`  OK   live: chain ${h.chain.id}, contracts deployed, store ${h.store}`);'
say "Launched. Next: Safe acceptOwnership (if ADMIN_ADDRESS), announce contract addresses on X, add the domain to the Reown allowlist."
