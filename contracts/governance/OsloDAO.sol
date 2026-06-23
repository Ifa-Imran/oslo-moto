// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IInvestmentEngine.sol";
import "../interfaces/IReferralRegistry.sol";

/// @title OsloDAO - Elite Governance (200 Members Max)
/// @notice Manages DAO membership qualification and monthly royalty distribution
contract OsloDAO is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    struct DAOMember {
        bool isQualified;
        uint256 slotNumber;
        uint256 qualificationTime;
        uint256 lastVerifiedMonth;
        uint256 teamSize;
        uint256 teamVolume;
        uint8 legCount;
    }

    IERC20 public immutable usdt;
    IInvestmentEngine public immutable investmentEngine;
    IReferralRegistry public referralRegistry;

    mapping(address => DAOMember) public members;
    address[] public qualifiedMembers;
    uint256 public constant MAX_MEMBERS = 200;
    /// @notice Distribution cooldown — 30 days for mainnet
    uint256 public constant DISTRIBUTION_COOLDOWN = 30 days;
    uint256 public lastDistribution;
    uint256 public totalProtocolTurnover;

    // Cycle-based claiming (pull model)
    uint256 public currentCycle;
    uint256 public cyclePool;         // Total USDT available for current cycle
    uint256 public cycleMemberCount;  // Member count when cycle started
    mapping(address => uint256) public lastClaimedCycle; // Tracks last claimed cycle per member

    event DAOMemberQualified(address indexed member, uint256 slotNumber, uint256 timestamp);
    event DAOMemberDisqualified(address indexed member, uint256 timestamp);
    event DAORewardDistributed(uint256 totalPool, uint256 memberCount, uint256 perMember, uint256 timestamp);
    event DAORoyaltyClaimed(address indexed member, uint256 amount, uint256 cycle, uint256 timestamp);
    event TeamStatsUpdated(address indexed member, uint256 teamSize, uint256 teamVolume, uint8 legCount);
    event NewCycleStarted(uint256 cycle, uint256 pool, uint256 memberCount, uint256 timestamp);

    error DAOFull();
    error TeamSizeInsufficient();
    error LegCountInsufficient();
    error SingleLegDominance();
    error VolumeInsufficient();
    error TooEarlyForDistribution();
    error NoQualifiedMembers();
    error ZeroAddress();
    error NotQualified();
    error AlreadyClaimed();
    error NoPoolAvailable();

    constructor(address _usdt, address _investmentEngine) {
        if (_usdt == address(0) || _investmentEngine == address(0)) revert ZeroAddress();
        usdt = IERC20(_usdt);
        investmentEngine = IInvestmentEngine(_investmentEngine);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(KEEPER_ROLE, msg.sender);
    }

    /// @notice Set the referral registry address
    function setReferralRegistry(address _registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_registry == address(0)) revert ZeroAddress();
        referralRegistry = IReferralRegistry(_registry);
    }

    /// @notice Update team stats for a member (called by keeper)
    /// @param user The member address
    /// @param teamSize Total team size
    /// @param teamVolume Total team volume in USDT (18 decimals on BSC)
    /// @param legCount Number of legs
    function updateTeamStats(
        address user,
        uint256 teamSize,
        uint256 teamVolume,
        uint8 legCount
    ) external onlyRole(KEEPER_ROLE) {
        DAOMember storage m = members[user];
        m.teamSize = teamSize;
        m.teamVolume = teamVolume;
        m.legCount = legCount;
        emit TeamStatsUpdated(user, teamSize, teamVolume, legCount);
    }

    /// @notice Verify qualification for DAO membership (keeper/admin — uses stored stats)
    /// @param user The user to verify
    function verifyQualification(address user) external onlyRole(KEEPER_ROLE) {
        DAOMember storage m = members[user];

        if (qualifiedMembers.length >= MAX_MEMBERS && !m.isQualified) revert DAOFull();
        if (m.teamSize < 250) revert TeamSizeInsufficient();
        if (m.legCount < 3) revert LegCountInsufficient();
        if (m.teamVolume < 25000 * 1e18) revert VolumeInsufficient(); // $25K USDT

        if (!m.isQualified) {
            m.slotNumber = qualifiedMembers.length + 1;
            qualifiedMembers.push(user);
            m.qualificationTime = block.timestamp;
            emit DAOMemberQualified(user, m.slotNumber, block.timestamp);
        }

        m.isQualified = true;
        m.lastVerifiedMonth = block.timestamp;
    }

    /// @notice Self-service qualification — any user can call for themselves
    /// Reads real-time team data from ReferralRegistry and InvestmentEngine
    function selfQualify() external {
        address user = msg.sender;
        DAOMember storage m = members[user];

        if (qualifiedMembers.length >= MAX_MEMBERS && !m.isQualified) revert DAOFull();

        // Read real-time team stats from source contracts
        uint256 teamSize = referralRegistry.getTeamSize(user);
        uint256 legCount = referralRegistry.getDirectDownlineCount(user);
        uint256 teamVolume = investmentEngine.getTeamVolume(user);

        // Update stored stats
        m.teamSize = teamSize;
        m.teamVolume = teamVolume;
        m.legCount = uint8(legCount);
        emit TeamStatsUpdated(user, teamSize, teamVolume, uint8(legCount));

        // Check qualification criteria
        if (teamSize < 250) revert TeamSizeInsufficient();
        if (legCount < 3) revert LegCountInsufficient();
        if (teamVolume < 25000 * 1e18) revert VolumeInsufficient(); // $25K USDT

        if (!m.isQualified) {
            m.slotNumber = qualifiedMembers.length + 1;
            qualifiedMembers.push(user);
            m.qualificationTime = block.timestamp;
            emit DAOMemberQualified(user, m.slotNumber, block.timestamp);
        }

        m.isQualified = true;
        m.lastVerifiedMonth = block.timestamp;
    }

    /// @notice Sync total protocol turnover from InvestmentEngine (anyone can call)
    function syncTurnover() external {
        totalProtocolTurnover = investmentEngine.totalProtocolTurnover();
    }

    /// @notice Disqualify a DAO member
    /// @param user The member to disqualify
    function disqualifyMember(address user) external onlyRole(KEEPER_ROLE) {
        DAOMember storage m = members[user];
        require(m.isQualified, "Not qualified");
        m.isQualified = false;
        emit DAOMemberDisqualified(user, block.timestamp);
    }

    /// @notice Distribute royalties to ALL qualified members at once (permissionless)
    /// Anyone can call after the cooldown period elapses
    function distributeRoyalties() external {
        _startNewCycleIfNeeded();

        uint256 memberCount = cycleMemberCount;
        if (memberCount == 0) revert NoQualifiedMembers();
        if (cyclePool == 0) revert NoPoolAvailable();

        uint256 perMember = cyclePool / memberCount;

        for (uint256 i = 0; i < qualifiedMembers.length;) {
            if (members[qualifiedMembers[i]].isQualified && lastClaimedCycle[qualifiedMembers[i]] != currentCycle) {
                usdt.safeTransfer(qualifiedMembers[i], perMember);
                lastClaimedCycle[qualifiedMembers[i]] = currentCycle;
            }
            unchecked { ++i; }
        }

        emit DAORewardDistributed(cyclePool, memberCount, perMember, block.timestamp);
    }

    /// @notice Claim individual DAO royalty (pull model)
    /// Qualified members call this to receive their share directly
    function claimRoyalty() external {
        DAOMember storage m = members[msg.sender];
        if (!m.isQualified) revert NotQualified();

        _startNewCycleIfNeeded();

        if (cyclePool == 0) revert NoPoolAvailable();
        if (lastClaimedCycle[msg.sender] == currentCycle) revert AlreadyClaimed();

        uint256 perMember = cyclePool / cycleMemberCount;
        lastClaimedCycle[msg.sender] = currentCycle;
        usdt.safeTransfer(msg.sender, perMember);

        emit DAORoyaltyClaimed(msg.sender, perMember, currentCycle, block.timestamp);
    }

    /// @notice Get pending royalty for a qualified member
    function getPendingRoyalty(address user) external view returns (uint256) {
        if (!members[user].isQualified) return 0;
        if (lastClaimedCycle[user] == currentCycle) return 0;
        if (cyclePool == 0 || cycleMemberCount == 0) return 0;
        return cyclePool / cycleMemberCount;
    }

    /// @notice Check if a new distribution cycle is available
    function isNewCycleAvailable() public view returns (bool) {
        return block.timestamp >= lastDistribution + DISTRIBUTION_COOLDOWN;
    }

    /// @notice Start a new distribution cycle if cooldown has elapsed
    function _startNewCycleIfNeeded() internal {
        if (!isNewCycleAvailable()) return;

        // Sync turnover from InvestmentEngine
        totalProtocolTurnover = investmentEngine.totalProtocolTurnover();

        // Calculate pool: 0.5% of total protocol turnover, capped to contract USDT balance
        uint256 pool = (totalProtocolTurnover * 50) / 10000;
        uint256 contractBalance = usdt.balanceOf(address(this));
        if (pool > contractBalance) {
            pool = contractBalance;
        }

        uint256 memberCount = _getActiveCount();

        currentCycle++;
        cyclePool = pool;
        cycleMemberCount = memberCount;
        lastDistribution = block.timestamp;

        emit NewCycleStarted(currentCycle, pool, memberCount, block.timestamp);
    }

    /// @notice Update the total protocol turnover (called by keeper/engine)
    /// @param amount Amount to add to total turnover
    function addTurnover(uint256 amount) external onlyRole(KEEPER_ROLE) {
        totalProtocolTurnover += amount;
    }

    /// @notice Get count of currently qualified members
    function _getActiveCount() internal view returns (uint256 count) {
        for (uint256 i = 0; i < qualifiedMembers.length;) {
            if (members[qualifiedMembers[i]].isQualified) {
                count++;
            }
            unchecked { ++i; }
        }
    }

    /// @notice Get the number of qualified members
    function getQualifiedMemberCount() external view returns (uint256) {
        return _getActiveCount();
    }

    /// @notice Get all qualified member addresses
    function getQualifiedMembers() external view returns (address[] memory) {
        return qualifiedMembers;
    }
}
