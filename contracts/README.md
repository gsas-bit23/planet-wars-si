# Planet Wars SI: contracts

Foundry workspace. See the [root README](../README.md#contracts) for the design, tokenomics and deployment guide.

```bash
forge build
forge test            # unit + fuzz (1,024 runs) + invariants
forge fmt --check
forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast   # needs DEPLOYER_PRIVATE_KEY
forge script script/SeedLocal.s.sol --rpc-url anvil --broadcast            # local demo state only
```

Deployments are written to `deployments/<chainId>.json`. Run `npm run contracts:sync` in the repo root to update the app bindings.
