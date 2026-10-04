// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PWSIToken} from "../src/PWSIToken.sol";
import {PWSIFaucet} from "../src/PWSIFaucet.sol";
import {PlanetTerritory} from "../src/PlanetTerritory.sol";
import {TerritoryMarketplace} from "../src/TerritoryMarketplace.sol";
import {BuybackBurnTreasury} from "../src/BuybackBurnTreasury.sol";
import {PlanetOps} from "../src/PlanetOps.sol";
import {IPWSIToken} from "../src/interfaces/IPWSIToken.sol";
import {GameConfig} from "./GameConfig.sol";

/// @notice Deploys and wires the full Planet Wars SI contract suite.
/// @dev `admin` must be the caller context (msg.sender in tests / broadcaster in scripts)
///      because role grants and body registration happen inside this function.
library DeployLib {
    struct Suite {
        PWSIToken token;
        PWSIFaucet faucet;
        BuybackBurnTreasury treasury;
        PlanetTerritory territory;
        TerritoryMarketplace marketplace;
        PlanetOps ops;
    }

    function deploy(address admin, address resistanceFund, string memory baseURI)
        internal
        returns (Suite memory s)
    {
        s.token = new PWSIToken(admin);
        IPWSIToken t = IPWSIToken(address(s.token));

        s.faucet = new PWSIFaucet(t, admin, GameConfig.FAUCET_DRIP, GameConfig.FAUCET_COOLDOWN);
        s.token.grantRole(s.token.MINTER_ROLE(), address(s.faucet));

        s.treasury = new BuybackBurnTreasury(t, admin);
        s.territory = new PlanetTerritory(t, admin, resistanceFund, GameConfig.PRIMARY_BURN_BPS, baseURI);
        s.marketplace = new TerritoryMarketplace(t, s.territory, s.treasury, admin, GameConfig.MARKET_FEE_BPS);
        s.ops = new PlanetOps(
            t,
            s.territory,
            admin,
            GameConfig.UPGRADE_BASE_COST,
            GameConfig.SHIELD_UNIT_COST,
            GameConfig.missionCosts()
        );

        GameConfig.BodyConfig[] memory b = GameConfig.bodies();
        for (uint256 i; i < b.length; ++i) {
            s.territory.addBody(b[i].name, b[i].supply, b[i].cols, b[i].basePrice, true);
        }
    }
}
