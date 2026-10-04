// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PWSIToken} from "../src/PWSIToken.sol";
import {PWSIFaucet} from "../src/PWSIFaucet.sol";
import {PlanetTerritory} from "../src/PlanetTerritory.sol";
import {TerritoryMarketplace} from "../src/TerritoryMarketplace.sol";
import {RevenueTreasury} from "../src/RevenueTreasury.sol";
import {RewardPool} from "../src/RewardPool.sol";
import {DailyDraw} from "../src/DailyDraw.sol";
import {PlanetOps} from "../src/PlanetOps.sol";
import {IPWSIToken} from "../src/interfaces/IPWSIToken.sol";
import {GameConfig} from "./GameConfig.sol";

/// @notice Deploys and wires the Planet Wars SI contract suite.
/// @dev `admin` must be the caller context (msg.sender in tests / broadcaster in scripts)
///      because role grants and body registration happen inside these functions.
library DeployLib {
    struct Game {
        RevenueTreasury treasury;
        RewardPool pool;
        DailyDraw draw;
        PlanetTerritory territory;
        TerritoryMarketplace marketplace;
        PlanetOps ops;
    }

    struct Suite {
        PWSIToken token;
        PWSIFaucet faucet;
        Game game;
    }

    struct Params {
        address admin;
        address operator; // backend signer: publishes reward roots and runs the lottery
        string baseURI;
        string contractURI;
        RevenueTreasury.BurnMode burnMode;
    }

    /// @notice Game contracts only, for an existing ERC-20 (e.g. a launchpad token on mainnet).
    function deployGame(IERC20 token, Params memory p) internal returns (Game memory g) {
        g.pool = new RewardPool(token, p.admin, GameConfig.EPOCH_BUDGET_BPS, GameConfig.LOTTERY_BPS);
        g.treasury = new RevenueTreasury(token, address(g.pool), p.admin, GameConfig.BURN_BPS, p.burnMode);
        g.territory =
            new PlanetTerritory(token, g.treasury, p.admin, p.baseURI, p.contractURI, GameConfig.ROYALTY_BPS);
        g.marketplace =
            new TerritoryMarketplace(token, g.territory, g.treasury, p.admin, GameConfig.MARKET_FEE_BPS);
        g.ops = new PlanetOps(
            token,
            g.territory,
            g.treasury,
            p.admin,
            GameConfig.UPGRADE_BASE_COST,
            GameConfig.SHIELD_UNIT_COST,
            GameConfig.missionCosts()
        );
        g.draw = new DailyDraw(p.admin, p.operator);

        bytes32 revenue = g.treasury.REVENUE_ROLE();
        g.treasury.grantRole(revenue, address(g.territory));
        g.treasury.grantRole(revenue, address(g.marketplace));
        g.treasury.grantRole(revenue, address(g.ops));
        if (p.operator != p.admin) g.pool.grantRole(g.pool.PUBLISHER_ROLE(), p.operator);

        GameConfig.BodyConfig[] memory b = GameConfig.bodies();
        for (uint256 i; i < b.length; ++i) {
            g.territory.addBody(b[i].name, b[i].supply, b[i].cols, b[i].basePrice, true);
        }
    }

    /// @notice Testnet: our own PWSI token + faucet + game, with a minted airdrop allocation.
    function deployTestnet(Params memory p, uint256 airdrop) internal returns (Suite memory s) {
        s.token = new PWSIToken(p.admin);
        IPWSIToken t = IPWSIToken(address(s.token));
        s.faucet = new PWSIFaucet(t, p.admin, GameConfig.FAUCET_DRIP, GameConfig.FAUCET_COOLDOWN);
        s.token.grantRole(s.token.MINTER_ROLE(), address(s.faucet));

        p.burnMode = RevenueTreasury.BurnMode.BurnFunction; // PWSI implements burn()
        s.game = deployGame(IERC20(address(s.token)), p);

        if (airdrop > 0) {
            bytes32 minter = s.token.MINTER_ROLE();
            s.token.grantRole(minter, p.admin);
            s.token.mint(p.admin, airdrop);
            s.token.revokeRole(minter, p.admin);
            s.token.approve(address(s.game.pool), airdrop);
            s.game.pool.fundAirdrop(airdrop);
        }
    }
}
