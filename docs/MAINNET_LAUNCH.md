# Mainnet launch checklist: Robinhood Chain (4663)

Status (2026-10-05): **production is in the mainnet pre-launch state, and nothing is deployed on mainnet.** https://pwsi.site is built for Robinhood Chain (4663) with no contracts. It shows "Launching soon", the lore and planets are browsable, every action is disabled with a clear note, there are no testnet traces, and it links to [@PlanetWSI](https://x.com/PlanetWSI). The testnet (46630) records stay in the repo (`contracts/deployments/46630.json`, `src/lib/generated/deployments.json`). Preview deployments still build for 46630.

On mainnet the game token is **not** deployed by this repo. It is launched on the **pons** launchpad, and `contracts/script/DeployMainnet.s.sol` deploys everything else around it: treasury, reward pool, daily draw, territory NFT, marketplace and ops. It deploys **no token and no faucet**.

> **Not audited.** These contracts have 115 Foundry tests (unit, fuzz, invariants), a self-review and static analysis, but no external audit. Get at least one independent review before real value goes in. See [Security review](#security-self-review-2026-10-05) for the risks we know about.

---

## 0. Network facts (verified 2026-10-05)

| | Mainnet | Source |
| --- | --- | --- |
| Chain ID | **4663** (`0x1237`), confirmed live with `eth_chainId` | [docs: connecting](https://docs.robinhood.com/chain/connecting/), [docs: add network](https://docs.robinhood.com/chain/add-network-to-wallet/) |
| Public RPC | `https://rpc.mainnet.chain.robinhood.com` (rate-limited; use a provider such as Alchemy `https://robinhood-mainnet.g.alchemy.com/v2/<key>` in production) | [docs: connecting](https://docs.robinhood.com/chain/connecting/) |
| Explorer | Blockscout, https://robinhoodchain.blockscout.com | [docs: deploy](https://docs.robinhood.com/chain/deploy-smart-contracts/) |
| Verification | `forge verify-contract … --verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api/` (no API key) | [docs: deploy](https://docs.robinhood.com/chain/deploy-smart-contracts/) |
| Gas | ETH. Base fee was **0.020 gwei** on 2026-10-05. Arbitrum Nitro (L2 `block.number` is L1, so DailyDraw uses ArbSys `0x64`), FCFS sequencer | [docs: about](https://docs.robinhood.com/chain/), [differences](https://docs.robinhood.com/chain/differences-from-ethereum/) |
| Block rate | about 10 L2 blocks/s, so the 256-block hash window is about 26 s | measured (block 80.36M after ~96 days) |
| Safe multisig | Supported: Safe{Wallet} at app.safe.global, tx service up. Safe 1.4.1 `0x41675C099F32341bf84BFc5382aF534df5C7461a` and proxy factory `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` both have code on 4663 | [Safe blog](https://safe.global/blog/what-protocols-check-before-deploying-on-your-chain), [safe-deployments 4663](https://github.com/safe-global/safe-deployments/commit/04f161e31cb420760e2660b8eb27695be493784a), [service status](https://github.com/safe-global/safe-services-status) |

## 1. Rehearsal results (no mainnet transaction sent)

1. **Simulation against the real mainnet RPC** (`forge script script/DeployMainnet.s.sol --rpc-url robinhood_mainnet`, no `--broadcast`, throwaway key, real pons V2 token `0x3fd71e7e…381a`, `BURN_MODE=burn`, `ADMIN_ADDRESS` set): **SIMULATION COMPLETE**, 30 transactions, forge estimate 14.44M gas (`0.00058 ETH` at forge's 2× max-fee).
2. **Fork rehearsal** (anvil `--fork-url` mainnet, broadcast **to the local fork only**): all 30 transactions succeeded, using **11.81M gas** in total. Arbitrum's L1 data component for all 30 transactions is about **2.5k gas** (measured with NodeInterface `0xC8`), which is negligible.
   - Then a real game loop with the pons token: plot claim (625) + upgrade (50) + listing + purchase (1% fee = 5) → revenue 680, **burned 68 (token `totalSupply` dropped by exactly 68)**, pooled 612, treasury balance 0. Royalty: 1% to the treasury.
   - Safe handover: the deployer holds no roles, and the Safe is admin and `pendingOwner`.
3. **Cost.** 11.81M gas × 0.020 gwei ≈ **0.00024 ETH** for the whole deploy. If gas rises 10×, it is still about 0.0024 ETH.
4. **Operator cost.** About 0.5M gas per day (commit 73k, close, reveal, publish), roughly 0.00001 ETH/day at 0.02 gwei, or about 0.004 ETH/year.

## 2. What you need to provide

| # | Item | Notes |
| --- | --- | --- |
| 1 | **Token address** from pons after launch | Use a **pons V2** token (`PonsV2LauncherToken`: OZ ERC20 + ERC20Burnable, 1B fixed supply, 18 decimals, no transfer fee) and deploy with `BURN_MODE=burn`. V1 tokens have no `burn()` and launch-window transfer limits, so use `BURN_MODE=dead` for those. The script refuses a token without 18 decimals, or without `burn()` in burn mode. Use symbol **PWSI**, because the UI copy says PWSI. pons docs currently say "public launching is closed" (`canLaunch(address)` on the factory `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`). Sources: [docs.ponsfamily.com](https://docs.ponsfamily.com/), [llms.txt](https://docs.ponsfamily.com/llms.txt), [github.com/ponsdotdev/ponsfamily](https://github.com/ponsdotdev/ponsfamily). |
| 2 | **New mainnet deployer wallet** (EOA, freshly generated, ideally on a hardware wallet), funded with **≥ 0.002 ETH** on 4663 | **Do not reuse the testnet deployer key.** It only signs the deploy, then renounces everything to the Safe. |
| 3 | **Separate operator wallet**, funded with **~0.003 ETH** | Publishes daily Merkle roots and runs the lottery. Its key goes into Vercel as a *sensitive* env var. It must differ from the deployer (the script enforces this) and from the Safe signers. |
| 4 | **Safe multisig on Robinhood Chain** (recommended **2-of-3**, signers on separate devices) | Becomes `ADMIN_ADDRESS`: admin of treasury, pool and draw, and owner of territory, marketplace and ops. Create it at app.safe.global → network "Robinhood Chain". |
| 5 | **New Supabase project** for mainnet | A database belongs to one chain. The app stamps `app_meta.chain_id` and refuses a mismatch. Never point mainnet at the testnet project. |
| 6 | **New secrets**: `LOTTERY_SECRET` (32+ random bytes, never the testnet one) and a new `CRON_SECRET` | `openssl rand -hex 32` |
| 7 | **RPC key** (e.g. Alchemy) | For `RPC_URL` (server) and optionally `NEXT_PUBLIC_ROBINHOOD_MAINNET_RPC_URL`. |
| 8 | **Airdrop allocation**: how many tokens, sent from the Safe | Mainnet has no mint, so the allocation must come from tokens you hold. |
| 9 | **Price review** | Game prices are in whole tokens (plots 40–… base, upgrades 50 × level, shields 2/unit, missions 25/75/200). With a market-priced token, decide whether these fit. The owner (Safe) can change them after deploy (`updateBody`, `setCosts`, `setMissionCost`); you can also edit `contracts/script/GameConfig.sol` before deploying. |
| 10 | **Reown (WalletConnect) allowlist** | Add `pwsi.site` and `www.pwsi.site` to the project's allowed domains. |

## 3. Launch sequence

### One command: `scripts/launch-mainnet.sh`

```bash
# rehearsal: every step except the mainnet broadcast, on an anvil mainnet fork
anvil --fork-url https://rpc.mainnet.chain.robinhood.com --chain-id 4663 --port 8547 &
DRY_RUN=1 FORK_RPC=http://127.0.0.1:8547 TOKEN_ADDRESS=0x<pons token> scripts/launch-mainnet.sh

# the launch (asks you to type "launch" before broadcasting)
TOKEN_ADDRESS=0x<pons token> [ADMIN_ADDRESS=0x<Safe>] [TOKEN_BUY_URL=https://<pons page>] scripts/launch-mainnet.sh
```

Inputs come from the environment: `MAINNET_DEPLOYER_PRIVATE_KEY`, `MAINNET_OPERATOR_PRIVATE_KEY` and `VERCEL_TOKEN`. `CRON_SECRET` / `LOTTERY_SECRET` (plus optionally `SUPABASE_SERVICE_ROLE_KEY_MAINNET`, checked against the mainnet project and its `app_meta` 4663 stamp before use) are read from `~/.planet-wars-si.mainnet.env`. Keys are passed only through exported env, so they never appear in argv, and nothing secret is printed.

The script runs these steps:

1. Check that the RPC is chain 4663, and refuse a "live" run against an anvil fork.
2. Validate the token: it must have code and 18 decimals; it reports the symbol, name and supply. It simulates `burn(0)` and sets `BURN_MODE=burn` for V2 tokens (`dead` otherwise, unless you force a mode).
3. Derive the deployer and operator addresses from the keys and require them to differ. Check them against the expected addresses, report balance and nonce, and enforce minimums (deployer ≥ 0.0008 ETH, operator ≥ 0.0005 ETH).
4. Simulate `DeployMainnet`, then deploy with `--broadcast --slow --verify --verifier blockscout`.
5. Run `npm run contracts:sync` and check that `select-network` now finds the 4663 deployment.
6. Run `npm run preflight`, which stops the launch on any failure.
7. Set the Vercel **production** env: `NEXT_PUBLIC_CHAIN_ID=4663`, `OPERATOR_PRIVATE_KEY` (from `MAINNET_OPERATOR_PRIVATE_KEY`, sensitive), `LOTTERY_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_TOKEN_BUY_URL`, and Supabase if provided.
8. Commit the deployment records and push to `main`, which triggers the Vercel deploy.
9. Wait for the deployment to be READY, then check live `/api/health`: chain 4663, rpcMatches, contractsDeployed, no faucet.

In `DRY_RUN=1` mode the script broadcasts **to the fork only** and skips verification, Vercel, git and live checks, printing them instead. On exit it restores the generated files and deletes `contracts/deployments/4663.json` and the 4663 broadcast/cache folders. Dry run of 2026-10-05 with the pons V2 token Vano `0x3fd71e7e…381a`: all steps passed (`BURN_MODE=burn`, 18 transactions, preflight green). The log is in [`docs/launch-dryrun.log`](launch-dryrun.log).

`scripts/vercel-env.mjs` (`list | set KEY FROM_ENV [type] | rm KEY | wait <sha>`) is the helper the script uses for Vercel. Values come from env var names, never from argv.

### Manual sequence (what the script does)


All commands run from `contracts/`. Keys go in your shell only; never commit them. Steps marked **(irreversible)** spend real ETH.

```bash
export PATH=$HOME/.foundry/bin:$PATH
export DEPLOYER_PRIVATE_KEY=0x...            # the NEW mainnet deployer
export TOKEN_ADDRESS=0x...                   # pons token
export OPERATOR_ADDRESS=0x...                # the NEW operator
export ADMIN_ADDRESS=0x...                   # the Safe
export BURN_MODE=burn                        # pons V2 ("dead" for anything without burn())
export METADATA_BASE_URI=https://pwsi.site/api/metadata/
export CONTRACT_URI=https://pwsi.site/api/metadata/contract
```

1. **Dry run** (no transactions):
   ```bash
   DEPLOY_OUT=deployments/dryrun-4663.json forge script script/DeployMainnet.s.sol --rpc-url robinhood_mainnet
   ```
   Check the printed addresses and the "Estimated amount required".
2. **Optional fork rehearsal**: `anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8547`, then the same command with `--rpc-url http://127.0.0.1:8547 --broadcast` and `DEPLOY_OUT=deployments/dryrun-fork-4663.json`. **Afterwards delete `broadcast/DeployMainnet.s.sol/4663/`** so `contracts:sync` cannot mistake it for the real deployment.
3. **Deploy (irreversible)**:
   ```bash
   forge script script/DeployMainnet.s.sol --rpc-url robinhood_mainnet --broadcast --slow \
     --verify --verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api/
   ```
   This writes `deployments/4663.json`. If verification fails, rerun `forge script … --resume --verify …`, or run `forge verify-contract <addr> src/<File>.sol:<Contract> --chain-id 4663 --verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api/ --guess-constructor-args`.
4. **Safe: accept ownership.** In the Safe Transaction Builder, call `acceptOwnership()` on **PlanetTerritory, TerritoryMarketplace and PlanetOps**. Batch them into one Safe transaction.
5. **Preflight** (read-only):
   ```bash
   cd .. && CHAIN_ID=4663 ADMIN_ADDRESS=$ADMIN_ADDRESS SITE_URL=https://pwsi.site npm run preflight
   ```
   It checks wiring, token decimals, `burn()`, royalties, contractURI, operator roles and balance, Safe roles and ownership, and that the deployer no longer holds any role. Every line must say PASS.
6. **Sync and commit**: `npm run contracts:sync`, then commit `contracts/deployments/4663.json` and `src/lib/generated/*`. The faucet becomes `null`, so the faucet page and link disappear on 4663.
7. **Supabase (new project)**: apply all files in `supabase/migrations/` in order (Supabase connector `apply_migration`, or `supabase db push`). Then run the security advisor.
8. **Fund the airdrop (from the Safe)**: `token.approve(RewardPool, amount)`, then `RewardPool.fundAirdrop(amount)`, batched in one Safe transaction.
9. **Switch Vercel production to mainnet.** Set these env vars in the Production environment:

   | Var | Value |
   | --- | --- |
   | `NEXT_PUBLIC_CHAIN_ID` | `4663` |
   | `NEXT_PUBLIC_SITE_URL` | `https://pwsi.site` |
   | `NEXT_PUBLIC_TOKEN_BUY_URL` | the token's pons page (shown as "Get PWSI" in place of the faucet) |
   | `NEXT_PUBLIC_ROBINHOOD_MAINNET_RPC_URL` | optional: browser RPC |
   | `RPC_URL` | server RPC for **4663** (`/api/health` reports `rpcMatches:false` if it points elsewhere) |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | the **new** project |
   | `OPERATOR_PRIVATE_KEY` (sensitive) | the **new** operator |
   | `LOTTERY_SECRET`, `CRON_SECRET` (sensitive) | the **new** values |
   | `NEXT_PUBLIC_FAUCET_ADDRESS`, other `NEXT_PUBLIC_*_ADDRESS` | **unset**. Addresses come from the committed `4663.json`. Alternatively, set them all, plus `NEXT_PUBLIC_DEPLOY_BLOCK`, `NEXT_PUBLIC_OPERATOR_ADDRESS` and `NEXT_PUBLIC_DEPLOYER_ADDRESS`, for an env-only switch. |

   Then redeploy, or push the sync commit.
10. **Verify live**:
    - `curl https://pwsi.site/api/health` should show `chain.id 4663`, `rpcMatches true`, `faucet false`, `store supabase`.
    - `/faucet` should return 404.
    - `/api/metadata/contract` should show the treasury as `fee_recipient`.
    - Claim one plot from a real wallet with a small amount.
11. **Cron**: trigger once with `curl -H "Authorization: Bearer $CRON_SECRET" https://pwsi.site/api/si/tick`. Expected output: lottery rounds for tomorrow and the day after are committed (a round must be committed before its UTC day starts, so the first lottery happens on day 2).
12. **Monitoring**: watch `EpochPublished` on the RewardPool and the operator's ETH balance. If anything looks wrong, use the incident steps below.
13. **Testnet afterwards (optional)**: to keep a testnet app, create a second Vercel project (e.g. `testnet.pwsi.site`) with `NEXT_PUBLIC_CHAIN_ID=46630` and the existing testnet Supabase and secrets.

## 4. Rollback and incident plan

The contracts are **not upgradeable**, and nothing on-chain can be rolled back. Plan accordingly.

- **Before step 9 (site still on testnet):** nothing is public. If something is wrong, redeploy a fresh suite; it only costs gas. Abandon the old addresses and never publish them.
- **App rollback:** use Vercel "Instant Rollback" to the previous production deployment, or set `NEXT_PUBLIC_CHAIN_ID=46630` and the testnet env, then redeploy. On-chain state is unaffected.
- **Stop the game (Safe):**
  - `TerritoryMarketplace.pause()`. Sellers can still `cancel` while paused.
  - `PlanetOps.pause()`.
  - `PlanetTerritory.updateBody(id, false, price)` for each body to stop claims.
  - Revenue only enters through these contracts, so this halts all inflows.
- **Operator key compromised:** the Safe revokes `PUBLISHER_ROLE` on RewardPool and `OPERATOR_ROLE` on DailyDraw from the old operator and grants them to a new one. Then rotate `OPERATOR_PRIVATE_KEY` in Vercel.
  - Worst case before the revoke: the attacker can publish at most (MAX_PUBLISH_LAG_DAYS + 1) = 4 back-dated epochs at once, then one per day. Each takes at most `epochBudgetBps` (20%) of the unallocated pool, so the one-time burst is ≤ 59% of rewards (1 − 0.8⁴).
  - Lower the exposure right away with `RewardPool.setConfig(100, 3000)` (1% per day).
  - **Published roots cannot be revoked.**
- **Lottery round fails** (missed reveal window): anyone calls `voidRound`, and the pot stays in the pool. No action needed.
- **Moving to new contracts (v2):** plots, levels and the pool balance do **not** migrate. RewardPool has no admin withdrawal by design: funds leave only through published epochs, or a sweep back into the pool. Decide prices and parameters carefully before launch.

## Security self-review (2026-10-05)

All `src/*.sol` were re-read for reentrancy, access control, rounding, Merkle double claims and operator powers. Slither also ran (see the README for the result).

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| 1 | **Publisher could release a backlog of back-dated epochs in one burst.** `publishRewards` only required `epochId ≤ today` and uniqueness. A leaked operator key could publish thousands of past days, each taking 20% of what was left, and drain about 100% of the pool. | **High** | **Fixed** (`b989a9b`): epochs must be strictly increasing and at most 3 days old, so the burst is bounded at 4 epochs. Regression tests: `test_RevertWhen_BackdatedBeyondLag`, `test_RevertWhen_OutOfOrder`, `test_PublisherBurstIsBounded`. The engine skips days it can no longer publish. **The deployed testnet v2 RewardPool still has the old check**, which is acceptable for worthless test tokens; a testnet redeploy (≈0.00015 ETH) would pick up the fix. |
| 2 | **Operator trust is inherent.** Leaderboard scores, lottery entrants and Merkle allocations are computed off-chain, and the root's contents are not verified on-chain. A malicious operator can direct up to the epoch cap per day to itself or sybils, and could refuse to reveal a lottery (that round is voided). | Medium (by design) | Documented. Mitigations: separate key with gas only, Safe can revoke, caps on-chain, all inputs published at `/api/rewards/epochs/<id>` and `/api/lottery/<round>` for anyone to re-check. Optional hardening: a claim delay with Safe veto. |
| 3 | **Lottery randomness**: commit-reveal plus a future L2 block hash. Operator + sequencer collusion could bias a draw. The 256-block hash window is about 26 s on mainnet, so a crash between `close` and `reveal` voids that day's lottery. | Medium/Low | Documented. Chainlink VRF is not available on this chain. |
| 4 | **Admin powers without a timelock** (only `burnBps` is timelocked): `RewardPool.setConfig` (budget up to 50%/day), prices (`updateBody`, `setCosts`, `setMissionCost`), market fee (≤ 5%), royalty (≤ 10%), `TerritoryMarketplace.setTreasury` (can redirect market fees to any address), `RevenueTreasury.setRouter`, pause. | Medium | Mitigated by the Safe (`ADMIN_ADDRESS` handover is built into the script and verified by `Handover.t.sol` and preflight). Optional: put the Safe behind an OpenZeppelin `TimelockController`. |
| 5 | `PlanetTerritory.claim` has no `maxPrice`, so the owner could raise a price between a player's approve and claim. | Low | The UI approves exact amounts, so a raised price makes the transaction revert. A wallet that granted a larger allowance would pay the new price. |
| 6 | No pause or rescue on RewardPool and RevenueTreasury; contracts are not upgradeable. | Info (by design) | Pool funds can only go to Merkle-entitled accounts. Revenue inflow is stopped by pausing ops and marketplace and deactivating bodies. |
| 7 | Reentrancy: Territory, Marketplace, Treasury and Pool use `nonReentrant` with checks-effects-interactions. `PlanetOps` has no guard, but updates state before calling the token and the trusted treasury. | Low | Fine for pons tokens (no transfer hooks). An ERC-777-style hook token is not supported. |
| 8 | Rounding: burn shares round down (dust goes to the pool). Off-chain shares round down. On-chain, each epoch's claims are capped by its declared total. uint128 casts now use SafeCast. | Info | OK |
| 9 | Merkle claims: double-hashed leaves `(epochId, account, amount)`, a claimed flag set before the transfer, one claim per (epoch, account), airdrop ids namespaced ≥ 1e9, 30-day window, then sweep. | Info | OK; covered by unit and invariant tests ("no double claims", "outstanding = sum of epochs"). |
| 10 | pons V1 tokens: launch-window max-wallet/max-tx limits could make pool or treasury transfers revert. | Low | Use a V2 token. `BURN_MODE=dead` for anything else. |
| 11 | Off-chain: one daily cron, public RPC rate limits, and a shared database across chains. | Low | Per-chain Supabase guard (`app_meta`), `/api/health` RPC check, and a dedicated RPC recommended. |
