// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IReferralRegistry.sol";
import "../interfaces/IOsloDEX.sol";
import "../interfaces/IOsloToken.sol";
import "../interfaces/IInvestmentEngine.sol";

/// @title LevelIncomeSystem - 20-Level Commission Distribution
/// @notice Distributes level commissions based on the referral tree
contract LevelIncomeSystem is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant ENGINE_ROLE = keccak256("ENGINE_ROLE");

    IReferralRegistry public immutable referralRegistry;
    IOsloDEX public immutable osloDEX;
    IOsloToken public immutable osloToken;
    IInvestmentEngine public investmentEngine;

    struct LevelConfig {
        uint256 level;
        uint256 rate; // Basis points (10000 = 100%)
        uint256 directsRequired;
    }

    LevelConfig[20] public levels;

    /// @notice Total USDT-value commissions earned by each user (auto-distributed as OSLO)
    mapping(address => uint256) public totalCommissionsEarned;

    event LevelCommissionPaid(
        address indexed recipient,
        address indexed claimer,
        uint256 level,
        uint256 usdtValue,
        uint256 osloAmount,
        uint256 timestamp
    );
    event InvestmentEngineUpdated(address indexed newEngine);

    error ZeroAddress();
    error EngineNotSet();

    constructor(
        address _referralRegistry,
        address _osloDEX,
        address _osloToken
    ) {
        if (_referralRegistry == address(0) || _osloDEX == address(0) || _osloToken == address(0)) {
            revert ZeroAddress();
        }
        referralRegistry = IReferralRegistry(_referralRegistry);
        osloDEX = IOsloDEX(_osloDEX);
        osloToken = IOsloToken(_osloToken);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        // Initialize level configuration
        _initLevels();
    }

    /// @notice Set the InvestmentEngine address (must be set before use)
    /// @param _engine The InvestmentEngine contract address
    function setInvestmentEngine(address _engine) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_engine == address(0)) revert ZeroAddress();
        investmentEngine = IInvestmentEngine(_engine);
        emit InvestmentEngineUpdated(_engine);
    }

    /// @notice Distribute commissions to uplines when a user claims yield
    /// @param claimer The user who claimed yield
    /// @param yieldAmount The USDT value of the yield claimed
    function distributeCommissions(address claimer, uint256 yieldAmount) external onlyRole(ENGINE_ROLE) {
        if (address(investmentEngine) == address(0)) revert EngineNotSet();

        for (uint256 i = 0; i < 20;) {
            address upline = referralRegistry.getUpline(claimer, levels[i].level);
            if (upline == address(0)) break;

            // Check if upline has enough qualified directs
            uint256 directCount = referralRegistry.getDirectDownlineCount(upline);
            if (directCount < levels[i].directsRequired) {
                unchecked { ++i; }
                continue;
            }

            // Check if upline's stake is active
            (, , , , , , bool isActive) = investmentEngine.stakes(upline);
            if (!isActive) {
                unchecked { ++i; }
                continue;
            }

            uint256 commission = (yieldAmount * levels[i].rate) / 10000;

            // Convert to OSLO at DEX price
            uint256 osloPrice = osloDEX.getPrice();
            if (osloPrice == 0) {
                unchecked { ++i; }
                continue;
            }
            // commission is in USDT (18 decimals on BSC), osloPrice is in 18 decimals
            // osloAmount (18 decimals) = usdtAmount (18 decimals) * 1e18 / price
            uint256 osloCommission = (commission * 1e18) / osloPrice;

            // Record earning against 3X cap
            investmentEngine.recordExternalEarning(upline, commission);

            // Track total commissions earned (USDT value)
            totalCommissionsEarned[upline] += commission;

            // Transfer OSLO to upline
            osloToken.transfer(upline, osloCommission);

            emit LevelCommissionPaid(upline, claimer, levels[i].level, commission, osloCommission, block.timestamp);

            unchecked { ++i; }
        }
    }

    /// @notice Initialize the 20-level commission structure
    /// Unlocking rules:
    ///   1 direct  → L1-L3   (3 levels)
    ///   2 directs → L4-L6   (3 levels)
    ///   3 directs → L7-L9   (3 levels)
    ///   5 directs → L10-L14 (5 levels)
    ///   7 directs → L15-L20 (6 levels)
    function _initLevels() internal {
        levels[0] = LevelConfig(1, 3000, 1);   // 30%, 1 direct
        levels[1] = LevelConfig(2, 1000, 1);   // 10%, 1 direct
        levels[2] = LevelConfig(3, 500, 1);    // 5%, 1 direct
        levels[3] = LevelConfig(4, 500, 2);    // 5%, 2 directs
        levels[4] = LevelConfig(5, 500, 2);    // 5%, 2 directs
        levels[5] = LevelConfig(6, 250, 2);    // 2.5%, 2 directs
        levels[6] = LevelConfig(7, 250, 3);    // 2.5%, 3 directs
        levels[7] = LevelConfig(8, 250, 3);    // 2.5%, 3 directs
        levels[8] = LevelConfig(9, 250, 3);    // 2.5%, 3 directs
        levels[9] = LevelConfig(10, 250, 5);   // 2.5%, 5 directs
        levels[10] = LevelConfig(11, 100, 5);  // 1%, 5 directs
        levels[11] = LevelConfig(12, 100, 5);  // 1%, 5 directs
        levels[12] = LevelConfig(13, 100, 5);  // 1%, 5 directs
        levels[13] = LevelConfig(14, 100, 5);  // 1%, 5 directs
        levels[14] = LevelConfig(15, 100, 7);  // 1%, 7 directs
        levels[15] = LevelConfig(16, 100, 7);  // 1%, 7 directs
        levels[16] = LevelConfig(17, 100, 7);  // 1%, 7 directs
        levels[17] = LevelConfig(18, 100, 7);  // 1%, 7 directs
        levels[18] = LevelConfig(19, 100, 7);  // 1%, 7 directs
        levels[19] = LevelConfig(20, 100, 7);  // 1%, 7 directs
    }
}
