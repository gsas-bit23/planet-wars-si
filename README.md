# Planet Wars SI

> A rogue superintelligence (the **SI**, signing as `SI//OVERMIND`) has annexed the solar system. Claim it back one plot at a time.

Planet Wars SI is an on-chain territory game for **Robinhood Chain**. It ran its public test on Robinhood Chain Testnet, and production is now in the **mainnet pre-launch** state. The eight planets are split into territory NFTs that you claim with the game token **$PWSI**. Players fortify plots, trade them peer-to-peer and defend worlds against the SI's daily attacks. All game revenue is split on arrival: **10% burned, 90% to a reward pool** that pays a daily top-100 leaderboard and a daily lottery for active players, claimed with Merkle proofs.

**Live:** <https://pwsi.site> · Robinhood Chain mainnet (4663) · token `$PWSI` [`0x96b9…8858`](https://robinhoodchain.blockscout.com/token/0x96b9e049C232FD2552ECFCE6F02A58e7CD648858) · [buy on pons](https://www.ponsfamily.com/launchpad/0x96b9e049C232FD2552ECFCE6F02A58e7CD648858) · X: [@PlanetWSI](https://x.com/PlanetWSI) · [mainnet launch checklist](docs/MAINNET_LAUNCH.md)

*Working title. PWSI is a game token and territories are in-game items, not financial products. Rewards come only from game revenue already in the pool, are capped per day, and are never a promised return.*

| Landing | Planet detail |
| --- | --- |
| ![Landing](screenshots/01-landing.png) | ![Planet detail](screenshots/02-planet-detail.png) |
| **Marketplace** | **SI broadcasts** |
| ![Marketplace](screenshots/03-marketplace.png) | ![SI feed](screenshots/04-si-broadcasts.png) |

More shots: [burn dashboard](screenshots/05-burn-dashboard.png), [portfolio](screenshots/06-portfolio.png), and the live testnet build: [landing](screenshots/07-testnet-landing.png), [burn](screenshots/08-testnet-burn.png), [marketplace](screenshots/09-testnet-marketplace.png). Rewards (live): [leaderboard](screenshots/live-leaderboard.png), [rewards & lottery](screenshots/live-rewards.png), [claim & airdrop](screenshots/live-claim.png), [revenue: burned vs pooled](screenshots/live-revenue.png).

---

## Contents
- [Architecture](#architecture)
- [Contracts](#contracts)
- [Tokenomics: revenue split](#tokenomics-revenue-split)
- [Rewards: leaderboard, lottery, Merkle claims, airdrop](#rewards-leaderboard-lottery-merkle-claims-airdrop)
- [Royalties & OpenSea](#royalties--opensea)
- [Mainnet: external token on the pons launchpad](#mainnet-external-token-on-the-pons-launchpad)
- [The SI (off-chain game engine)](#the-si-off-chain-game-engine)
- [Network: Robinhood Chain Testnet](#network-robinhood-chain-testnet)
- [Live deployment](#live-deployment-robinhood-chain-testnet-46630)
- [Local setup (anvil, end-to-end)](#local-setup-anvil-end-to-end)
- [Deploying to Robinhood Chain Testnet](#deploying-to-robinhood-chain-testnet)
- [Deploying the web app (Vercel)](#deploying-the-web-app-vercel)
- [Environment variables](#environment-variables)
- [Testing & quality gates](#testing--quality-gates)
- [Security notes](#security-notes)
- [Credits & licenses](#credits--licenses)

## Architecture

```
                      ┌──────────────────────────── Robinhood Chain Testnet (46630) ─────────────────────────────┐
 wallet (RainbowKit)──┼─▶ PWSIFaucet ──mint──▶ PWSIToken (testnet only; mainnet = external pons token)          │
   wagmi + viem       │                                                                                            │
                      ├─▶ PlanetTerritory (ERC-721 + ERC-2981 1%) ── claim price ─┐                                │
                      ├─▶ PlanetOps (upgrades · shields · missions) ── cost ───────┤                               │
                      ├─▶ TerritoryMarketplace ── 1% fee ──────────────────────────┤                               │
                      │   external marketplaces ── royalties (ETH/PWSI) ───────────┤                               │
                      │                                                            ▼                               │
                      │            RevenueTreasury.notifyRevenue(source)  (same tx, never holds PWSI)              │
                      │               ├── burnBps (10%, bounds 5–50%, 2-day timelock) ─▶ burn() or 0x…dEaD         │
                      │               └── rest (90%) ─▶ RewardPool ◀── airdrop allocation (separate bucket)        │
                      │                                    │  publishRewards(day, merkleRoot, lb, lottery) ≤ cap   │
                      ├─▶ RewardPool.claim / claimMany ◀───┘  publishAirdrop(1e9+season, root)                   │
                      └── DailyDraw: commit(seedHash) → close(entrants) → reveal(seed) ⇒ randomness ⇒ winners      │
                                         │ events / views
 Next.js 16 (App Router) ◀──────────────┘
   ├─ UI: React 19, Tailwind v4, Radix/shadcn-style primitives, motion, react-three-fiber
   ├─ /api/burns              revenue events (RevenueProcessed: amount, burned, pooled, source)
   ├─ /api/leaderboard        daily scores (live for today, stored once published)
   ├─ /api/rewards            epochs, lottery rounds, scoring config  · /api/rewards/epochs/[id] (all proofs)
   ├─ /api/claims?address=    a wallet's allocations + Merkle proofs  · /api/airdrop?address= eligibility
   ├─ /api/lottery/[round]    verification data (seed, entrants, target block, randomness, winners)
   ├─ /api/si/*               SI feed, signed defenses, daily cron (SI tick + rewards engine)
   ├─ /api/metadata/[id]      ERC-721 metadata · /api/metadata/contract (contractURI, OpenSea format)
   └─ /api/health
 Postgres (Supabase) ◀── service-role key, server only. In-memory fallback when not configured.
```

**Design split.** Ownership, the token, claims, the marketplace, the revenue split, reward caps and claims live on-chain. Game logic (SI broadcasts, attacks, defense resolution, planet control) runs off-chain in the backend and DB. It is deterministic from `SI_SEED` plus the UTC day, so every server instance agrees on the schedule even before anything is persisted.

### Repository layout
```
contracts/            Foundry workspace (src, test, script, deployments/<chainId>.json)
scripts/              sync-contracts.mjs → src/lib/generated/{abis,deployments}.ts
src/app/              routes: / /planets /planets/[slug] /marketplace /portfolio /leaderboard /rewards /claim /broadcasts /faucet /burn + /api/*
src/components/       ui primitives, layout, landing, planet, market, si, burn, three (3D)
src/lib/              chains, contracts, wagmi config, planet metadata, hooks
src/server/           env, viem client, indexer, rate limiting, SI engine, rewards engine, store (memory | supabase)
supabase/migrations/  Postgres schema + RLS
e2e/                  Playwright end-to-end flow + screenshot capture
```

## Contracts

Solidity 0.8.28 (cancun) with OpenZeppelin Contracts v5. Everything is in `contracts/src`.

| Contract | Role |
| --- | --- |
| `PWSIToken` | **Testnet only.** ERC-20 + Burnable + Permit + AccessControl. `MINTER_ROLE` (faucet only). Hard **1,000,000,000 lifetime mint cap**. On mainnet the game uses an external token (see [pons](#mainnet-external-token-on-the-pons-launchpad)). |
| `PWSIFaucet` | **Testnet only.** 2,500 PWSI per claim, at most once per wallet every 24 h. |
| `PlanetTerritory` | ERC-721 Enumerable (`PWSI-T`) + **ERC-2981** (1% to the treasury, capped at 10%) + `contractURI()`. Bodies are added with `addBody(...)`. `tokenId = bodyId × 1e6 + plotIndex`. Zones per 5×5 sector: **Legendary 4% (×10 price)**, **Rare 16% (×2.5)**, Common. Claim payments go to the RevenueTreasury. |
| `TerritoryMarketplace` | Escrowed listings, `buy(tokenId, maxPrice)` with slippage protection. **1% fee** (hard max 5%) to the RevenueTreasury. |
| `PlanetOps` | Upgrades (50 × (level+1), to level 10), shields (2 PWSI/unit), missions (Recon 25, Sabotage 75, Liberation 200). All costs go to the RevenueTreasury. |
| `RevenueTreasury` | Receives **all** revenue and splits it in the same transaction: `burnBps` burned (default 10%), the rest to the RewardPool. Burn mode is fixed at deploy: `BurnFunction` (`token.burn`) or `DeadAddress` (transfer to `0x…dEaD`, works for any ERC-20). Tracks `totalRevenue`, `totalBurned`, `totalPooled`, `revenueBySource[8]`. `burnBps` bounded **5–50%**, changes need `queueBurnBps` → 2 days → `applyBurnBps`. Permissionless `process()` splits stray PWSI (e.g. token royalties). `buybackAndSplit` (KEEPER) swaps ETH royalties to the token via a V2 router. |
| `RewardPool` | Merkle distributor. `publishRewards(day, root, leaderboardTotal, lotteryTotal, …)` (PUBLISHER) is capped on-chain at `epochCap()` = `epochBudgetBps` (20%, bounds 1–50%) of unallocated rewards, and each slice at its share (`lotteryBps` 30%). A separate **airdrop allocation** (`fundAirdrop`, `publishAirdrop` with ids ≥ 1e9) never touches revenue rewards. `claim` / `claimMany` (anyone can relay; funds go to the account), one claim per (epoch, account), 30-day window, then `sweep` returns leftovers. |
| `DailyDraw` | Commit-reveal lottery randomness: `commit(round, keccak256(seed))` before the UTC day starts → `close(round, entrantsHash, n)` after it ends (target = current L2 block + 10, via ArbSys) → `reveal(round, seed)` within 256 blocks. randomness = `keccak256(seed, blockhash(target), round, entrantsHash)`. Anyone can `voidRound` a withheld reveal; voided rounds are never redrawn. `drawIndices(randomness, n, k)` (view) picks the winners. |

All token movements use OpenZeppelin `SafeERC20`, so non-standard ERC-20s (no return value) work. Revenue is measured from the treasury's balance, so fee-on-transfer tokens are handled too (the token's own fee is then taken on the split transfers).

### Planet configuration (`script/GameConfig.sol`)

| # | Planet | Plots | Grid cols | Base price (PWSI) |
| - | --- | ---: | ---: | ---: |
| 1 | Mercury | 600 | 30 | 120 |
| 2 | Venus | 800 | 40 | 140 |
| 3 | Earth | 1,000 | 40 | 250 |
| 4 | Mars | 1,500 | 50 | 180 |
| 5 | Jupiter | 5,000 | 100 | 40 |
| 6 | Saturn | 4,000 | 80 | 50 |
| 7 | Uranus | 2,500 | 50 | 70 |
| 8 | Neptune | 2,500 | 50 | 75 |

Smaller, denser worlds cost more per plot. Gas giants offer thousands of cheaper plots.

## Tokenomics: revenue split

The language here is deliberate. Territories are **in-game plots**, not shares, and nothing in this game is an investment. PWSI is a utility/game token on a testnet with no monetary value. Rewards are paid **only from revenue already in the pool**, are capped per day, shrink when revenue shrinks, and are never promised.

| Revenue source (`RevenueTreasury` source id) | Paid by | Split |
| --- | --- | --- |
| Plot claims (0) | player → treasury | 10% burned · 90% RewardPool |
| Upgrades (1), shields (2), missions (3) | player → treasury | 10% · 90% |
| Marketplace fee, 1% of each sale (4) | buyer → treasury | 10% · 90% |
| ERC-2981 royalties (5) / ETH buybacks (6) / other (7) | external marketplaces / keeper / anyone via `process()` | 10% · 90% |
| Faucet (testnet) | mints 2,500 PWSI per wallet per 24 h | no revenue |

- **Owner-configurable within bounds, with a timelock.** `burnBps` can only be 500–5000 (5–50%). A change is queued on-chain, visible for 2 days, then anyone can apply it. Pool budgets (`epochBudgetBps` 1–50%, `lotteryBps` 10–70%) are bounded too.
- **Burn tracking in our contracts.** `/burn` (Revenue) reads `treasury.totalBurned/totalPooled/revenueBreakdown` and the `RevenueProcessed` events, so it also works for an external token without a burn counter.
- **Invariants (tested):** burned + pooled == revenue for every payment (fuzz, any bps); the treasury never holds tokens; pool balance == airdrop funding + pooled − claimed and always ≥ airdrop reserve + outstanding allocations; no (epoch, account) is paid twice; per-epoch claimed ≤ total.

## Rewards: leaderboard, lottery, Merkle claims, airdrop

The daily cron (`/api/si/tick`, 00:05 UTC) runs the rewards engine (`src/server/rewards/`) after the SI tick. It is idempotent and re-runnable. For each finished UTC day D:

1. **Commit** seeds for the next two rounds (`seed = HMAC-SHA256(LOTTERY_SECRET, chainId:round)`).
2. **Close** round D with the entrant list, wait for the target L2 block, **reveal** (or void if the window was missed).
3. **Score** the leaderboard for D, merge with lottery winners, build an OpenZeppelin `StandardMerkleTree` over `(uint256 epochId, address account, uint256 amount)`, store all proofs, and **publish** the root to `RewardPool` with the operator key. The contract enforces the caps.

Epoch budget: `epochCap = 20% × unallocated rewards`, split **70% leaderboard / 30% lottery**. An unused slice simply stays in the pool.

### Daily leaderboard (top 100)
- `holdScore` = Σ over plots **held continuously ≥ 24 h at the end of the day** of zone weight (common 1, rare 2.5, legendary 6) × (1 + level/4).
- `activityScore` (per day, capped): upgrades 3 pts (max 5), shields 2 (max 5), missions 1 (max 5), SI defenses 1 (max 5).
- `score = holdScore + activityScore`. Only wallets with **≥ 1 qualifying action that day** rank. Ties break by address.
- **Wash/self-trade resistance:** marketplace trades score **0**, and any transfer (including a purchase) restarts the 24-hour holding clock. Moving plots between your own wallets earns nothing and costs the 1% fee. Protocol wallets (contracts, deployer, operator, `REWARDS_EXCLUDE`) never rank.
- **Payout curve** (share of the leaderboard pot): #1 10%, #2 6%, #3 4%, #4–10 2% each, #11–25 1% each, #26–50 0.8% each, #51–100 0.62% each (sums to 100%). With fewer than 100 ranked players, shares are renormalised over those present.

### Daily lottery (100 winners, equal shares, free entry)
- **Eligibility:** at least one qualifying game event in the last **N UTC days** (`LOTTERY_ACTIVITY_DAYS`, default **7**): plot claim, upgrade, shield, mission, marketplace trade (buyer or seller), or SI defense. Protocol wallets are excluded.
- **Anti-sybil:** every qualifying on-chain action costs PWSI (10% burned), and defenses need a held plot, so each extra wallet costs real in-game spend. A sybil can still buy several tickets this way; we accept and document that trade-off rather than adding identity checks.
- **Randomness and its limits:** Chainlink VRF does not list Robinhood Chain ([supported networks](https://docs.chain.link/vrf/v2-5/supported-networks)); Chainlink is present there only via Data Streams and CCIP. `prevrandao` is constant on this Arbitrum chain and `block.number` is the L1 block ([Robinhood: differences from Ethereum](https://docs.robinhood.com/chain/differences-from-ethereum/)). Third-party VRF-style coordinators exist on testnet (Randomhood, Quiver, Dice Protocol) but are unaudited, operator-trust services. We therefore use **commit-reveal + a future L2 block hash** (`DailyDraw`): the operator can't pick winners after seeing the block hash (the seed is committed before the day starts and the entrant list is fixed before the target block), and the sequencer doesn't know the seed. Residual trust: the operator could withhold a reveal (that day's lottery is voided and the pot stays in the pool, with no redraw), and operator + sequencer collusion could bias a draw. Everything is independently checkable via `/api/lottery/<round>` and `DailyDraw.drawIndices`.

### Claims
`/claim` → **Daily rewards** tab: all of a wallet's unclaimed epochs in one `claimMany` transaction. Proofs come from `/api/claims?address=`, and each epoch's full allocation list (the URI emitted on-chain) is at `/api/rewards/epochs/<id>`. 30-day claim window, then `sweep` returns leftovers to the pool.

### Airdrop
The testnet deploy funds a separate **10,000,000 PWSI airdrop allocation** inside the RewardPool (`AIRDROP_ALLOCATION`). `/claim` → **Airdrop** tab shows live eligibility for season 1: any qualifying game event or faucet use, 1,000 base + 250 per active UTC day (max 8) + 500 if the wallet claimed a plot, scaled down pro-rata if the allocation would be exceeded. The operator publishes the snapshot once:
```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://<site>/api/rewards/airdrop?season=1"
```
Season 1 has **not** been published yet. The snapshot time is the project owner's call.

## Royalties & OpenSea
- `PlanetTerritory` implements **ERC-2981**: `royaltyInfo` returns 1% to the RevenueTreasury (owner-adjustable, capped at 10%). Royalties received in ETH can be swapped with `buybackAndSplit`; royalties in the token are split with `process()`.
- `contractURI()` → `/api/metadata/contract` (name, description, image, `seller_fee_basis_points: 100`, `fee_recipient` = treasury) in [OpenSea's contract-level metadata format](https://docs.opensea.io/docs/contract-level-metadata). Token metadata includes absolute image URLs and OpenSea-style `attributes`.
- **OpenSea supports Robinhood Chain mainnet (4663)**, including NFTs ([announcement](https://opensea.io/blog/articles/robinhood-chain-is-live-on-opensea), [OpenSea learn](https://opensea.io/learn/blockchain/what-is-robinhood-chain)). I found no OpenSea support for **Robinhood Chain Testnet (46630)**, so treat testnet listing there as unsupported. Marketplaces may or may not honour ERC-2981; it is a signal, not enforcement. A chain-native marketplace (HOODIES) is listed in [the community guide](https://rhchain.network/guide/).

## Mainnet: external token on the pons launchpad

> **Launch checklist:** [docs/MAINNET_LAUNCH.md](docs/MAINNET_LAUNCH.md) covers what you need to provide (pons token, new deployer, separate operator, Safe multisig, new Supabase project), the exact command sequence, `npm run preflight`, the Vercel switch to chain 4663, rollback and incident steps, and the security self-review. Simulated against mainnet and rehearsed on a mainnet fork with a real pons V2 token: 30 transactions, 11.8M gas ≈ **0.00024 ETH** at 0.02 gwei.

On Robinhood Chain **mainnet (4663)** the game token is **not deployed by this repo**. The project owner launches it on **pons** (pons.family / ponsfamily.com), and the game contracts are deployed around it. **Nothing has been deployed to mainnet.**

**What pons produces (researched 2026-10-05):**
- pons is a token launchpad on Robinhood Chain mainnet (chain 4663) with a bonding curve that graduates into a locked Uniswap V4 pool. Sources: [docs.ponsfamily.com](https://docs.ponsfamily.com/) ([llms.txt](https://docs.ponsfamily.com/llms.txt)), [github.com/ponsdotdev/ponsfamily](https://github.com/ponsdotdev/ponsfamily), [Coinmonks: tracking the pons launchpad on-chain](https://medium.com/coinmonks/pons-api-on-robinhood-chain-how-to-track-the-pons-launchpad-on-chain-91b91e6b6a4b).
- **V2 tokens (`PonsV2LauncherToken`)**: OpenZeppelin `ERC20` + `ERC20Burnable`, fixed 1B supply minted once to the curve, 18 decimals, **no transfer fee, no mint, no blacklist**. Creator tax/fees live in the curve and the V4 hook, not in the token. They expose `burn(uint256)` but no burn counter. V2 factory: `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`.
- **V1 tokens (`PonsLauncherToken`)**: plain ERC-20 **without** `burn()`, with launch-window buy limits (max wallet/tx, same-block snipe protection) enforced from the pool. V1 factory: `0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB`.
- The docs say public launching is currently closed (check `canLaunch(address)` on the factory).

**How the contracts handle it:** every game contract takes the token address as a constructor parameter (`DeployLib.deployGame(IERC20 token, …)`). The treasury burns with `token.burn()` (`BURN_MODE=burn`, for pons V2) or by transferring to `0x000000000000000000000000000000000000dEaD` (`BURN_MODE=dead`, the default; works with any ERC-20), and it keeps its own `totalBurned`. All transfers use SafeERC20. Tests cover a plain non-burnable token, a no-return-value token and a fee-on-transfer token (`ExternalToken.t.sol`, `RevenueTreasury.t.sol`).

**Deploying the game on mainnet (when ready; not done).** Run `TOKEN_ADDRESS=0x… scripts/launch-mainnet.sh` (rehearse first with `DRY_RUN=1 FORK_RPC=…`; see [the checklist](docs/MAINNET_LAUNCH.md)). The manual equivalent:
```bash
cd contracts
export DEPLOYER_PRIVATE_KEY=...            # admin; consider a multisig as admin afterwards
export TOKEN_ADDRESS=0x...                 # the pons-launched token
export OPERATOR_ADDRESS=0x...              # backend publisher key (separate from the admin)
export ADMIN_ADDRESS=0x...                 # Safe multisig; receives all admin roles
export BURN_MODE=burn                      # pons V2 (ERC20Burnable) · "dead" for anything else
export METADATA_BASE_URI=https://pwsi.site/api/metadata/ CONTRACT_URI=https://pwsi.site/api/metadata/contract
forge script script/DeployMainnet.s.sol --rpc-url robinhood_mainnet            # dry run first
forge script script/DeployMainnet.s.sol --rpc-url robinhood_mainnet --broadcast --verify \
  --verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api/
```
`DeployMainnet.s.sol` deploys everything **except the token and the faucet**. It checks that `TOKEN_ADDRESS` has code and 18 decimals, and that the operator differs from the deployer. In `burn` mode it simulates `burn(0)` to refuse tokens without `burn()`. With `ADMIN_ADDRESS` (a Safe) it hands every admin role to the Safe, the deployer renounces them, and the Safe then calls `acceptOwnership()` on territory, marketplace and ops. It writes `deployments/4663.json` with `faucet: 0x0`; `npm run contracts:sync` turns that into `faucet: null`, and the UI then **hides the faucet page and nav link** (`/faucet` returns 404). Set `NEXT_PUBLIC_TOKEN_BUY_URL` to the token's pons page to show a "Get PWSI" link instead. The airdrop allocation on mainnet must be funded by the owner with `RewardPool.fundAirdrop(amount)` (approve first). `Deploy.s.sol` refuses chain 4663.

## The SI (off-chain game engine)

`src/server/si/` holds the SI engine.

- **Daily broadcast.** The engine picks a deterministic template from `SI_SEED + day`. If `SI_LLM_API_KEY` is set (any OpenAI-compatible endpoint), the cron asks the model for an in-character transmission, validates it with zod, and persists it.
- **Attacks.** Three per day, each targeting a planet sector, with an 8 h window and a severity.
- **Defense.** Owners sign an EIP-191 message: attack id, token id, wallet, and a timestamp within 10 minutes. The server verifies the signature (`verifyMessage`, smart-account compatible), checks `ownerOf` on-chain, checks that the territory is on the attacked planet, and rate-limits per IP. Each territory can defend each attack only once (DB unique key). Defense power = 10 + 12 × level + shield / 2.
- **Missions.** On-chain `MissionLaunched` events feed the engine. Sabotage lowers the severity of the next attack. Recon and Liberation reduce SI control on that planet.
- **Planet control.** A 14-day rolling SI-control percentage per planet, driven by repelled vs. breached attacks and missions.

## Network: Robinhood Chain Testnet

Verified on 2026-10-05: a live `eth_chainId` call against the RPC returned `0xb626` (46630), and the explorer API responded.

| | |
| --- | --- |
| Chain ID | **46630** |
| RPC | `https://rpc.testnet.chain.robinhood.com` |
| Explorer | <https://explorer.testnet.chain.robinhood.com> (Blockscout, API at `/api`) |
| Gas token | ETH (testnet) |
| Gas faucets | <https://faucet.testnet.chain.robinhood.com> (official) · <https://www.alchemy.com/faucets/robinhood-testnet> |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |

Sources:
- <https://docs.robinhood.com/chain/connecting/>
- <https://docs.robinhood.com/chain/add-network-to-wallet/>
- <https://docs.robinhood.com/chain/deploy-smart-contracts/>
- <https://robinhood.com/us/en/support/articles/robinhood-chain-testnet/>

**Fallback.** `NEXT_PUBLIC_CHAIN_ID=84532` switches the app to Base Sepolia (a `base_sepolia` RPC alias is also in `foundry.toml`). The default build target is Robinhood Chain mainnet (4663); set `NEXT_PUBLIC_CHAIN_ID=46630` for the testnet.

## Live deployment: Robinhood Chain mainnet (4663)

**Launched 2026-10-05** from deployer `0xAB9F26b5A8898193429D55cBF7492B748EdE627D` (nonce 0→18). Operator (publisher + lottery): `0xdB9Cf47053e0EF3af68E6870f282E7574E2De3E0`. All six game contracts are source-verified on Sourcify (`exact_match`); Blockscout imports Sourcify matches (its API is Cloudflare-gated from this host). Token is the pons-launched PWSI at the address below (`BURN_MODE=burn`). No faucet.

| Contract | Address |
| --- | --- |
| PWSI (token) | [`0x96b9e049C232FD2552ECFCE6F02A58e7CD648858`](https://robinhoodchain.blockscout.com/token/0x96b9e049C232FD2552ECFCE6F02A58e7CD648858) · [buy on pons](https://www.ponsfamily.com/launchpad/0x96b9e049C232FD2552ECFCE6F02A58e7CD648858) |
| RevenueTreasury | [`0x596E9a0120DE1484648a67BFc32944D01A653dbE`](https://robinhoodchain.blockscout.com/address/0x596E9a0120DE1484648a67BFc32944D01A653dbE) |
| RewardPool | [`0xF30b9411DCaC20940B79fd0295169F36FF81F137`](https://robinhoodchain.blockscout.com/address/0xF30b9411DCaC20940B79fd0295169F36FF81F137) |
| DailyDraw | [`0x4cB957A52380CE6D12C1c4e7Aa6a17ebD46Bd7C0`](https://robinhoodchain.blockscout.com/address/0x4cB957A52380CE6D12C1c4e7Aa6a17ebD46Bd7C0) |
| PlanetTerritory | [`0x8D87Ff624B381872d9e3015276AB87a32D99393b`](https://robinhoodchain.blockscout.com/address/0x8D87Ff624B381872d9e3015276AB87a32D99393b) |
| TerritoryMarketplace | [`0xdFB3ef835C2BA1458F5e96EbFE1EF575F9af2da8`](https://robinhoodchain.blockscout.com/address/0xdFB3ef835C2BA1458F5e96EbFE1EF575F9af2da8) |
| PlanetOps | [`0x4Ef086Aa9e84193Efe4dBE6cd01B04640658E5a8`](https://robinhoodchain.blockscout.com/address/0x4Ef086Aa9e84193Efe4dBE6cd01B04640658E5a8) |

Deploy L2 gas: 11.43M ≈ **0.000229 ETH**. Lottery rounds for 2026-10-06 and 2026-10-07 were committed by the first cron run.

## Testnet deployment record: Robinhood Chain Testnet (46630)

These are kept for reference. Production (pwsi.site) no longer builds for the testnet, so none of this appears on the public site. To run a testnet build, set `NEXT_PUBLIC_CHAIN_ID=46630` (Vercel preview deployments do this).

**v2 (current, rewards economy)**: deployed 2026-10-05 from `0x6F9AC937d6621226943FD3bB9a5B7e33EC81a616`; first deploy transaction in L2 block 128943055. All eight contracts are source-verified on Blockscout. Rewards operator (publisher + lottery): `0x8cfDeb78ac72179245603b09b63cB71e4dB07094`.

| Contract | Address |
| --- | --- |
| PWSIToken | [`0x80573fDA543d361C451e0f85b175f0AeA757d5ff`](https://explorer.testnet.chain.robinhood.com/address/0x80573fDA543d361C451e0f85b175f0AeA757d5ff) |
| PWSIFaucet | [`0xBEcd392f6a303C29637Cc1b081A7F2F5B2483a1e`](https://explorer.testnet.chain.robinhood.com/address/0xBEcd392f6a303C29637Cc1b081A7F2F5B2483a1e) |
| RevenueTreasury | [`0x7C4083a83e8226A1149377b3Bd6499788257dA6b`](https://explorer.testnet.chain.robinhood.com/address/0x7C4083a83e8226A1149377b3Bd6499788257dA6b) |
| RewardPool | [`0x2490c8eee6d32864FE55275512E6cC5abF1A39F7`](https://explorer.testnet.chain.robinhood.com/address/0x2490c8eee6d32864FE55275512E6cC5abF1A39F7) |
| DailyDraw | [`0xe29B76FbC21D834968BA724AC26f20D2EC5312A5`](https://explorer.testnet.chain.robinhood.com/address/0xe29B76FbC21D834968BA724AC26f20D2EC5312A5) |
| PlanetTerritory | [`0x60E586dBb1618cB3b96c800B39f8Ddb5E1e77554`](https://explorer.testnet.chain.robinhood.com/address/0x60E586dBb1618cB3b96c800B39f8Ddb5E1e77554) |
| TerritoryMarketplace | [`0x9F27149781327d391E30B902e5F015665d5559e6`](https://explorer.testnet.chain.robinhood.com/address/0x9F27149781327d391E30B902e5F015665d5559e6) |
| PlanetOps | [`0x681FB69C99351F8C224092fc2B2D618429D12529`](https://explorer.testnet.chain.robinhood.com/address/0x681FB69C99351F8C224092fc2B2D618429D12529) |

The v1 suite (token `0xd3B1…Ac08`, territory `0xA10F…7639`, BuybackBurnTreasury, etc.) is **abandoned**. The app no longer reads it, and v1 test balances and plots do not carry over.

The NFT metadata base URI is `https://pwsi.site/api/metadata/` and `contractURI` is `https://pwsi.site/api/metadata/contract` (owner-updatable).

The web app runs at **https://pwsi.site** (`www.pwsi.site` and **https://planet-wars-si.vercel.app** serve the same deployment) on Vercel, built from `main`. Off-chain SI and rewards state lives in Supabase (`supabase/migrations`, RLS on, public read). The daily cron calls `/api/si/tick`.

`scripts/smoke-testnet.sh` re-runs the live smoke test (faucet, claim, upgrade, mission, list, buy by the operator wallet) and prints revenue/burn/pool totals.

**Note on block numbers.** Robinhood Chain is Arbitrum-based, so Solidity's `block.number` returns the L1 block. `npm run contracts:sync` takes the deploy block from the forge broadcast receipts (L2 numbers), and `DailyDraw` uses ArbSys (`0x64`) `arbBlockNumber`/`arbBlockHash` for its target block.

## Local setup (anvil, end-to-end)

Requirements: Node 20+, [Foundry](https://book.getfoundry.sh/getting-started/installation) and Git.

```bash
git clone --recursive https://github.com/gsas-bit23/planet-wars-si && cd planet-wars-si
npm ci

# 1. local chain
anvil --block-time 1 --port 8545 &

# 2. deploy + seed (uses anvil's PUBLIC test mnemonic; local only)
cd contracts
DEPLOYER_PRIVATE_KEY=$(cast wallet private-key "test test test test test test test test test test test junk" 0) \
OPERATOR_ADDRESS=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
METADATA_BASE_URI=http://localhost:3000/api/metadata/ \
  forge script script/Deploy.s.sol --rpc-url anvil --broadcast
forge script script/SeedLocal.s.sol --rpc-url anvil --broadcast   # claims, upgrades, listings, sales
cd ..

# 3. sync ABIs + addresses into the app
npm run contracts:sync

# 4. run
cat > .env.local <<'ENV'
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_LOCAL_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_ENABLE_DEV_WALLET=true
RPC_URL=http://127.0.0.1:8545
# anvil account #2 (public test key) as the local rewards operator
OPERATOR_PRIVATE_KEY=$(cast wallet private-key "test test test test test test test test test test test junk" 2)
LOTTERY_SECRET=local-dev
CRON_SECRET=local-dev
ENV
npm run dev
```

That derives anvil's well-known public accounts from its public test mnemonic. Never use them on a real network. Run the local dev server **without** `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` in the environment, otherwise local test epochs are written to your real database.

With `NEXT_PUBLIC_ENABLE_DEV_WALLET=true` and chain 31337, the connect modal offers an **Anvil Dev Wallet** (anvil account #1). It lets you play the whole loop without a browser extension, and Playwright uses it:

```bash
npm run e2e          # connect → faucet → claim plots → upgrade → buy → list → defend
npm run screenshots  # writes screenshots/*.png
node e2e/rewards-local.mjs  # 3 players, time travel, cron → lottery reveal → epoch publish → claims → airdrop
node e2e/rewards-ui.mjs     # claim + airdrop UI with the dev wallet, rewards pages
node e2e/live-shots.mjs  # screenshots of the deployed site (BASE_URL overrides)
```

## Deploying to Robinhood Chain Testnet

1. Fund a deployer address with testnet ETH from one of the faucets above.
2. Deploy. Provide the key through your shell or a secrets manager, never in a committed file:
   ```bash
   cd contracts
   export DEPLOYER_PRIVATE_KEY=...        # or use `cast wallet import` + --account
   export OPERATOR_ADDRESS=0x...          # backend publisher/lottery key (defaults to the deployer)
   export METADATA_BASE_URI=https://<your-domain>/api/metadata/
   export CONTRACT_URI=https://<your-domain>/api/metadata/contract
   export AIRDROP_ALLOCATION=10000000000000000000000000   # optional (default 10M PWSI)
   forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast --slow \
     --verify --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/
   ```
   This writes `contracts/deployments/46630.json`.
3. Run `npm run contracts:sync` and commit `src/lib/generated/deployments.json`, or set the `NEXT_PUBLIC_*_ADDRESS` env vars instead.
4. Fund the operator with a little ETH (each commit/close/reveal/publish costs ~0.000002 ETH at 0.01 gwei) and set `OPERATOR_PRIVATE_KEY` + `LOTTERY_SECRET` on the server.

Until addresses exist for the target chain, the UI shows a "contracts not deployed on this network" banner and disables write actions.

## Deploying the web app (Vercel)

`vercel.json` configures the Next.js build and a **daily cron** (`00:05 UTC`) hitting `/api/si/tick`. Vercel sends `Authorization: Bearer $CRON_SECRET`.

1. Import the repo in Vercel and set the env vars below. At minimum, set `NEXT_PUBLIC_CHAIN_ID` (`4663` production, `46630` testnet preview) and `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.
2. Optionally create a Supabase project and apply `supabase/migrations/*.sql` with `supabase db push` or the SQL editor. Then set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Set `METADATA_BASE_URI` at contract deploy time to `https://<vercel-domain>/api/metadata/`.

Everything runs on free tiers: Vercel Hobby (1 daily cron), Supabase Free, and public RPCs.

## Environment variables

See [`.env.example`](.env.example) for the full annotated list.

| Variable | Scope | Required | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_CHAIN_ID` | client | yes | `4663` Robinhood Chain mainnet (default), `46630` Robinhood testnet, `31337` anvil, `84532` Base Sepolia fallback. Selected at build time by `scripts/select-network.mjs`, which embeds only that chain's config and deployment; with no deployment the site shows the pre-launch state |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | client | recommended | Reown/WalletConnect project ID. Without it, only injected and Coinbase wallets are offered. |
| `NEXT_PUBLIC_SITE_URL` | client | prod | Canonical URL for metadata and OG tags |
| `NEXT_PUBLIC_ROBINHOOD_RPC_URL`, `NEXT_PUBLIC_LOCAL_RPC_URL`, `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL` | client | no | RPC overrides |
| `NEXT_PUBLIC_{TOKEN,FAUCET,TREASURY,REWARD_POOL,DAILY_DRAW,TERRITORY,MARKETPLACE,OPS}_ADDRESS`, `NEXT_PUBLIC_DEPLOY_BLOCK` | client | no | Override the generated deployment. No faucet address → faucet page/link hidden. |
| `NEXT_PUBLIC_TOKEN_BUY_URL` | client | mainnet | Where to get the token when there is no faucet (e.g. its pons page) |
| `NEXT_PUBLIC_ROBINHOOD_MAINNET_RPC_URL` | client | no | RPC override for chain 4663 |
| `NEXT_PUBLIC_ENABLE_DEV_WALLET` | client | no | Local burner wallet. Only honoured on chain 31337. |
| `RPC_URL` | server | no | Server-side RPC (for example, an Alchemy URL) for the indexer, signature checks and the rewards publisher |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | server | prod | Persistent SI + rewards state. If unset, an in-memory store is used. |
| `CRON_SECRET` | server | prod | Protects `/api/si/tick` and `/api/rewards/airdrop` |
| `OPERATOR_PRIVATE_KEY` | server (sensitive) | prod | Rewards operator: commits/reveals lottery rounds and publishes Merkle roots. Holds only gas ETH; it can publish within on-chain caps but can't move pool funds elsewhere. **Never the deployer/admin key.** |
| `LOTTERY_SECRET` | server (sensitive) | prod | HMAC key for lottery seeds. Rotating it breaks reveals of already-committed rounds. |
| `LOTTERY_ACTIVITY_DAYS` | server | no | Lottery eligibility window in UTC days (default 7) |
| `REWARDS_EXCLUDE` | server | no | Comma-separated extra wallets excluded from leaderboard/lottery/airdrop |
| `SI_SEED` | server | no | Changes the deterministic SI schedule |
| `SI_LLM_API_KEY`, `SI_LLM_BASE_URL`, `SI_LLM_MODEL` | server | no | Optional LLM-written broadcasts (any OpenAI-compatible API) |
| `DEPLOYER_PRIVATE_KEY`, `OPERATOR_ADDRESS`, `METADATA_BASE_URI`, `CONTRACT_URI`, `AIRDROP_ALLOCATION` | forge (testnet) | deploy | `Deploy.s.sol`. **Never commit keys.** |
| `TOKEN_ADDRESS`, `BURN_MODE`, `ADMIN_ADDRESS`, `DEPLOY_OUT` | forge (mainnet) | deploy | `DeployMainnet.s.sol`: external token, `burn`/`dead`, final Safe admin, optional output file for dry runs |
| `NEXT_PUBLIC_OPERATOR_ADDRESS`, `NEXT_PUBLIC_DEPLOYER_ADDRESS` | client | no | Protocol wallets excluded from rewards, for an env-only chain switch (normally read from the deployment file) |

## Testing & quality gates

```bash
npm run test:contracts   # forge test: 115 tests in 11 suites (unit, fuzz with 1,024 runs, 8 invariants)
npm run contracts:fmt    # forge fmt --check
npm run typecheck        # tsc --noEmit
npm run lint             # eslint
npm run build            # next build
npm run check            # all of the above
```

The contract tests cover:
- **Fuzz:** marketplace fee conservation (`price = sellerProceeds + fee` at any price and fee bps), the 1% fee never overcharging, sale settlement, faucet cooldown timing, burn accounting, shield costs and buyback output.
- **Fuzz (rewards):** burned + pooled == revenue at any amount and bps, epoch caps, `drawIndices` against a naive Fisher-Yates reference (distinct, in range, same output).
- **Invariants:** token supply conservation, the treasury never retaining tokens, split sums to revenue, revenue equal to a ghost tally, pool conservation (funded − claimed == balance), outstanding allocations equal to unclaimed epoch totals, no double claims, and marketplace escrow equal to active listings.
- **External tokens:** a plain ERC-20 without `burn()`, a USDT-style no-return token (full game in dead-address mode) and a fee-on-transfer token.
- **End-to-end (anvil):** `e2e/rewards-local.mjs` runs the real cron/engine against local contracts: lottery commit → close → reveal, winners equal to on-chain `drawIndices`, Merkle publish, `claimMany`, double-claim rejection, airdrop publish + claim.

A ready-to-use GitHub Actions workflow is in [`docs/ci.workflow.yml`](docs/ci.workflow.yml). Copy it to `.github/workflows/ci.yml` to enable it. It wasn't pushed there directly because the publishing token lacked the `workflow` scope.

## Security notes
- Key handling: the deployer key is read only from the environment by `forge script`. It is never needed by the app.
- Exact-amount ERC-20 approvals by default; there are no unlimited approvals.
- The marketplace uses escrow, so listings can't go stale against moved NFTs. `buy` takes `maxPrice` to stop front-run repricing. `cancel` works while paused so users can always exit. Reentrancy is guarded and state is updated before transfers.
- The fee is capped at 5% in the contract, and the default is 1%.
- Rewards: the pool pays only from its own balance; each publish is capped on-chain (`epochCap`, per-slice caps) and can't touch the airdrop reserve; claims are one-per-(epoch, account) and go only to the account in the leaf (double-hashed leaves, so no second-preimage tricks). The operator key can publish roots and run the lottery, nothing else; the admin (deployer) can pause, change bounded params and queue a burn-rate change behind a 2-day timelock. Rewards epochs must be strictly increasing UTC days and at most 3 days old (`MAX_PUBLISH_LAG_DAYS`), so a compromised operator can release at most 4 capped epochs at once (≤ 59% of unallocated rewards at the default 20% budget), then one per day, until the admin revokes its role. Published roots cannot be revoked: monitor `EpochPublished`. Full self-review and residual risks: [docs/MAINNET_LAUNCH.md](docs/MAINNET_LAUNCH.md#security-self-review-2026-10-05). The contracts are **not externally audited**. Slither (high/medium/low detectors) found nothing actionable.
- The lottery's trust limits are documented [above](#daily-lottery-100-winners-equal-shares-free-entry).
- The faucet cooldown is enforced on-chain against `block.timestamp`.
- Defense API: signature + on-chain ownership + timestamp skew + per-IP rate limits + DB uniqueness.
- One Supabase project per chain: the server stamps `app_meta.chain_id` on first use and refuses to read or write a project stamped for another chain. `/api/health` also reports whether the server RPC matches `NEXT_PUBLIC_CHAIN_ID`.
- Supabase: RLS is enabled with public read only. Writes use the service-role key server-side (`server-only` imports).
- Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) are set in `next.config.ts`.
- Lints that are deliberately excluded are justified in `contracts/foundry.toml`.
- The contracts are **unaudited** and intended for testnet.

## Credits & licenses
- Planet textures: [Solar System Scope](https://www.solarsystemscope.com/textures/), **CC BY 4.0**, retrieved via Wikimedia Commons and converted to WebP. The Uranus texture is generated procedurally.
- Fonts: Syne, Inter Tight, JetBrains Mono and Instrument Serif (SIL Open Font License, via `next/font`).
- OpenZeppelin Contracts (MIT) and forge-std (MIT/Apache-2.0).
- Code: MIT.

Planet Wars SI is an independent fan/game project and is not affiliated with Robinhood or any space company.
