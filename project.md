OSLO Protocol: World-Class Backend & Frontend Implementation Guide
This is a comprehensive blueprint to build a production-grade DeFi protocol. I'll break this down into Smart Contract Architecture, Frontend Engineering, Security Hardening, and DevOps/Deployment.
Part 1: Smart Contract Architecture
Tech Stack
Solidity: ^0.8.20 with custom errors (gas efficient)
Framework: Hardhat + TypeScript
Libraries: OpenZeppelin Contracts v5, Ethers.js v6
Testing: Hardhat Network + Chai/Mocha
Linting: Solhint + Prettier Solidity
Project Structure
plain
oslo-protocol/
├── contracts/
│   ├── tokens/
│   │   └── OsloToken.sol
│   ├── core/
│   │   ├── InvestmentEngine.sol
│   │   ├── OsloDEX.sol
│   │   └── RewardVault.sol
│   ├── referral/
│   │   ├── ReferralRegistry.sol
│   │   └── LevelIncomeSystem.sol
│   ├── governance/
│   │   └── OsloDAO.sol
│   └── access/
│       └── OsloTimelock.sol
├── scripts/
│   ├── deploy/
│   └── verify/
├── test/
│   ├── unit/
│   └── integration/
├── frontend/
│   ├── src/
│   └── public/
└── hardhat.config.ts
Part 2: Contract-by-Contract Implementation Deep Dive
1. OsloToken.sol (The Deflationary Asset)
Key Design Decisions:
Use ERC20Burnable from OpenZeppelin but override mint functionality to ensure it's dead
Implement AccessControl with BURNER_ROLE instead of simple ownership
Custom burnFrom that checks authorization before burning from reserve
solidity
// Critical implementation notes:
bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

// Override _mint to be a no-op after deployment
function _mint(address, uint256) internal pure override {
    revert("MintingDisabled");
}

// Authorized burners only
function burnFrom(address account, uint256 amount) public override onlyRole(BURNER_ROLE) {
    super.burnFrom(account, amount);
}
Deployment Checklist:
[ ] Mint exactly 11_100_000 * 1e18 to deployer
[ ] Transfer 11M to InvestmentEngine address
[ ] Transfer 100K to OsloDEX address
[ ] Grant BURNER_ROLE to InvestmentEngine and OsloDEX
[ ] Renounce DEFAULT_ADMIN_ROLE or transfer to Timelock
[ ] Verify total supply == 11.1M on BSCScan
2. InvestmentEngine.sol (The Central Nervous System)
Architecture Pattern: State Machine + Accounting Ledger
Core State Variables:
solidity
struct UserStake {
    uint256 activeStake;          // USDT amount (6 decimals)
    uint256 totalEarnings;        // Lifetime earnings tracking
    uint256 stakeStartTime;       // Unix timestamp
    uint8 stakeDayIndex;          // 0-6 rotation
    uint8 tier;                   // 1 or 2
    address referrer;             // Upline
    bool isActive;                // Stake status
}

mapping(address => UserStake) public stakes;
mapping(address => uint256) public totalClaimed;
uint256 public totalProtocolTurnover; // For DAO calculations
Yield Calculation (Gas-Optimized):
solidity
// Basis points arrays (10000 = 100%)
uint16[7] public tier1Rates = [100, 75, 95, 65, 100, 85, 55]; // 5.75% weekly
uint16[7] public tier2Rates = [115, 100, 115, 110, 105, 100, 125]; // 7.70% weekly

function calculateAccruedYield(address user) public view returns (uint256) {
    UserStake memory s = stakes[user];
    if (!s.isActive) return 0;
    
    uint256 daysElapsed = (block.timestamp - s.stakeStartTime) / 1 days;
    uint256 yield = 0;
    uint16[7] memory rates = s.tier == 1 ? tier1Rates : tier2Rates;
    
    // Calculate full weeks + remaining days
    for (uint256 i = 0; i < daysElapsed; i++) {
        uint8 dayIndex = uint8((s.stakeDayIndex + i) % 7);
        yield += (s.activeStake * rates[dayIndex]) / 10000;
    }
    
    return yield;
}
The 3X Cap Enforcement (Critical):
solidity
modifier checkThreeXCap(address user, uint256 additionalYield) {
    UserStake storage s = stakes[user];
    uint256 newTotal = s.totalEarnings + additionalYield;
    uint256 cap = s.activeStake * 3;
    
    if (newTotal >= cap) {
        // Cap reached - stop earnings
        s.totalEarnings = cap;
        s.isActive = false;
        emit ThreeXCapReached(user, cap, cap);
        emit EarningStopped(user, block.timestamp);
        _;
        // Return early after emitting
    } else {
        s.totalEarnings = newTotal;
        _;
    }
}
USDT Split Logic (96/2/1/1):
solidity
function _splitDeposit(uint256 amount) internal {
    uint256 toDEX = (amount * 9600) / 10000;      // 96%
    uint256 toVault = (amount * 200) / 10000;      // 2%
    uint256 toCompany = (amount * 100) / 10000;    // 1%
    uint256 toPerf = amount - toDEX - toVault - toCompany; // 1% (avoids rounding)
    
    usdt.safeTransfer(address(osloDEX), toDEX);
    usdt.safeTransfer(address(rewardVault), toVault);
    usdt.safeTransfer(companyWallet, toCompany);
    usdt.safeTransfer(perfWallet, toPerf);
}
Yield Claim Flow (USDT → OSLO Conversion):
solidity
function claimYield() external nonReentrant whenNotPaused {
    UserStake storage s = stakes[msg.sender];
    require(s.isActive, "No active stake");
    
    uint256 accrued = calculateAccruedYield(msg.sender);
    uint256 alreadyClaimed = totalClaimed[msg.sender];
    uint256 claimable = accrued - alreadyClaimed;
    require(claimable > 0, "No yield to claim");
    
    // Check 3X cap
    uint256 projectedTotal = s.totalEarnings + claimable;
    uint256 cap = s.activeStake * 3;
    
    if (projectedTotal >= cap) {
        claimable = cap - s.totalEarnings; // Only claim up to cap
        s.isActive = false;
        emit ThreeXCapReached(msg.sender, cap, cap);
    }
    
    s.totalEarnings += claimable;
    totalClaimed[msg.sender] += claimable;
    
    // Convert USDT yield to OSLO at DEX price
    uint256 osloPrice = osloDEX.getPrice(); // Returns USDT per OSLO (18 decimals)
    uint256 osloAmount = (claimable * 1e18 * 1e12) / osloPrice; // Normalize decimals
    
    // Burn from reserve pool (11M pool)
    osloToken.burnFrom(address(rewardVault), osloAmount);
    
    // Transfer OSLO to user
    osloToken.transfer(msg.sender, osloAmount);
    
    // Trigger level commission distribution
    levelSystem.distributeCommissions(msg.sender, claimable);
    
    emit YieldClaimed(msg.sender, claimable, osloAmount, osloPrice);
}
3. ReferralRegistry.sol (The 20-Level Tree)
Data Structure (Gas-Optimized):
solidity
mapping(address => address) public directReferrer; // 1 upline
mapping(address => address[]) public directDownlines; // Many downlines
mapping(address => mapping(uint256 => address)) public uplineAtLevel; // Cache for quick lookup

function registerReferral(address user, address referrer) external onlyEngine {
    require(user != referrer, "Self-referral blocked");
    require(directReferrer[user] == address(0), "Already registered");
    require(_isValidReferrer(referrer, user), "Circular referral");
    
    directReferrer[user] = referrer;
    directDownlines[referrer].push(user);
    
    // Build upline cache up to 20 levels
    address current = referrer;
    for (uint256 i = 1; i <= 20; i++) {
        if (current == address(0)) break;
        uplineAtLevel[user][i] = current;
        current = directReferrer[current];
    }
    
    emit ReferralRegistered(user, referrer);
}

function _isValidReferrer(address referrer, address user) internal view returns (bool) {
    address current = referrer;
    for (uint256 i = 0; i < 20; i++) {
        if (current == address(0)) return true;
        if (current == user) return false; // Circular!
        current = directReferrer[current];
    }
    return true;
}
4. LevelIncomeSystem.sol (Commission Distribution)
Commission Matrix:
solidity
struct LevelConfig {
    uint256 level;
    uint256 rate; // Basis points
    uint256 directsRequired;
}

LevelConfig[] public levels = [
    LevelConfig(1, 3000, 1),    // 30%, 1 direct
    LevelConfig(2, 1000, 1),    // 10%
    LevelConfig(3, 500, 1),     // 5%
    LevelConfig(4, 500, 2),     // 5%, 2 directs
    LevelConfig(5, 500, 2),
    LevelConfig(6, 250, 2),     // 2.5%
    LevelConfig(7, 250, 2),
    LevelConfig(8, 250, 3),     // 3 directs
    LevelConfig(9, 250, 3),
    LevelConfig(10, 250, 3),
    LevelConfig(11, 100, 3),    // 1%
    LevelConfig(12, 100, 5),    // 5 directs
    LevelConfig(13, 100, 5),
    LevelConfig(14, 100, 5),
    LevelConfig(15, 100, 5),
    LevelConfig(16, 100, 7),    // 7 directs
    LevelConfig(17, 100, 7),
    LevelConfig(18, 100, 7),
    LevelConfig(19, 100, 7),
    LevelConfig(20, 100, 7)
];
Distribution Logic:
solidity
function distributeCommissions(address claimer, uint256 yieldAmount) external onlyEngine {
    for (uint256 i = 0; i < levels.length; i++) {
        address upline = referralRegistry.getUpline(claimer, levels[i].level);
        if (upline == address(0)) break;
        
        if (!_hasQualifiedDirects(upline, levels[i].directsRequired)) continue;
        
        uint256 commission = (yieldAmount * levels[i].rate) / 10000;
        
        // Convert to OSLO and send
        uint256 osloPrice = osloDEX.getPrice();
        uint256 osloCommission = (commission * 1e18 * 1e12) / osloPrice;
        
        // Track against recipient's 3X cap via InvestmentEngine
        investmentEngine.recordExternalEarning(upline, commission);
        
        osloToken.transfer(upline, osloCommission);
        
        emit LevelCommissionPaid(upline, claimer, levels[i].level, commission, osloCommission, block.timestamp);
    }
}
5. OsloDEX.sol (One-Way Deflationary DEX)
Core Invariants:
No buyOslo() function exists
Price = usdtReserve / osloReserve
50% burn, 50% retain on sell
10% tax stays in LP
solidity
function sellOslo(uint256 osloAmount) external nonReentrant whenNotPaused {
    require(osloAmount > 0, "Zero amount");
    require(totalBurned < BURN_CAP, "Burn cap reached");
    
    // Transfer OSLO from user
    osloToken.transferFrom(msg.sender, address(this), osloAmount);
    
    // Calculate USDT value
    uint256 currentPrice = getPrice();
    uint256 usdtOut = (osloAmount * currentPrice) / 1e18;
    
    // 10% tax
    uint256 tax = usdtOut / 10;
    uint256 usdtToUser = usdtOut - tax;
    
    // 50/50 split on OSLO
    uint256 burnAmount = osloAmount / 2;
    uint256 retainAmount = osloAmount - burnAmount;
    
    // Check burn cap
    if (totalBurned + burnAmount > BURN_CAP) {
        burnAmount = BURN_CAP - totalBurned;
        retainAmount = osloAmount - burnAmount;
    }
    
    // Execute
    if (burnAmount > 0) {
        osloToken.burn(burnAmount);
        totalBurned += burnAmount;
    }
    
    // Update reserves
    usdtReserve += tax; // Tax stays in LP
    usdtReserve -= usdtToUser; // Pay user
    osloReserve += retainAmount; // Retained half stays
    
    // Send USDT to user
    usdt.safeTransfer(msg.sender, usdtToUser);
    
    // New price (should be higher)
    uint256 newPrice = getPrice();
    
    emit SellExecuted(msg.sender, osloAmount, usdtToUser, burnAmount, retainAmount, newPrice, block.timestamp);
    
    if (totalBurned >= BURN_CAP) {
        emit BurnCapReached(totalBurned, block.timestamp);
    }
}

function getPrice() public view returns (uint256) {
    if (osloReserve == 0) return 0;
    return (usdtReserve * 1e18) / osloReserve; // 18 decimal price
}
Burn Cap Floor Logic:
solidity
uint256 public constant TOTAL_SUPPLY = 11_100_000 * 1e18;
uint256 public constant BURN_CAP = 9_990_000 * 1e18; // 90% of supply
uint256 public constant MINIMUM_FLOOR = 1_110_000 * 1e18;
uint256 public totalBurned;
6. OsloDAO.sol (Elite Governance)
Qualification Tracking:
solidity
struct DAOMember {
    bool isQualified;
    uint256 slotNumber;
    uint256 qualificationTime;
    uint256 lastVerifiedMonth;
    uint256 teamSize;
    uint256 teamVolume;
    uint8 legCount;
}

mapping(address => DAOMember) public members;
address[] public qualifiedMembers;
uint256 public constant MAX_MEMBERS = 200;
Monthly Verification (Keeper/Admin triggered):
solidity
function verifyQualification(address user) external onlyRole(KEEPER_ROLE) {
    DAOMember storage m = members[user];
    
    require(qualifiedMembers.length < MAX_MEMBERS || m.isQualified, "DAO full");
    require(m.teamSize >= 250, "Team size insufficient");
    require(m.legCount >= 3, "Minimum 3 legs required");
    require(_checkLegDistribution(user), "Single leg dominance");
    require(m.teamVolume >= 25000 * 1e6, "Volume insufficient"); // $25K USDT
    
    if (!m.isQualified) {
        m.slotNumber = qualifiedMembers.length + 1;
        qualifiedMembers.push(user);
        emit DAOMemberQualified(user, m.slotNumber, block.timestamp);
    }
    
    m.isQualified = true;
    m.lastVerifiedMonth = block.timestamp;
}

function distributeRoyalties() external onlyRole(KEEPER_ROLE) {
    require(block.timestamp >= lastDistribution + 30 days, "Too early");
    
    uint256 pool = (totalProtocolTurnover * 50) / 10000; // 0.5%
    uint256 memberCount = qualifiedMembers.length;
    require(memberCount > 0, "No members");
    
    uint256 perMember = pool / memberCount;
    
    for (uint256 i = 0; i < memberCount; i++) {
        if (members[qualifiedMembers[i]].isQualified) {
            usdt.safeTransfer(qualifiedMembers[i], perMember);
        }
    }
    
    lastDistribution = block.timestamp;
    emit DAORewardDistributed(pool, memberCount, perMember, block.timestamp);
}
7. RewardVault.sol (Liquidity Buffer)
solidity
function releaseOSLO(address to, uint256 amount) external onlyRole(ENGINE_ROLE) {
    osloToken.transfer(to, amount);
}

function releaseUSDT(address to, uint256 amount) external onlyRole(ENGINE_ROLE) {
    usdt.safeTransfer(to, amount);
}
8. Access Control & Timelock
OsloTimelock.sol:
solidity
contract OsloTimelock is TimelockController {
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(minDelay, proposers, executors, admin) {}
}
Role Assignment:
DEFAULT_ADMIN_ROLE → Timelock address
GOVERNANCE_ROLE → Timelock address
ENGINE_ROLE → InvestmentEngine only
BURNER_ROLE → InvestmentEngine + OsloDEX
KEEPER_ROLE → Trusted keeper (for monthly DAO distributions)
Part 3: Frontend Architecture
Tech Stack
Framework: Next.js 14 (App Router) + TypeScript
Styling: Tailwind CSS + shadcn/ui
Web3: Wagmi v2 + Viem + RainbowKit
State: Zustand + TanStack Query
Charts: Recharts or TradingView Lightweight Charts
Notifications: React Hot Toast
Project Structure
plain
frontend/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx            # Dashboard
│   │   ├── stake/
│   │   ├── dex/
│   │   ├── team/
│   │   └── dao/
│   ├── components/
│   │   ├── ui/                 # shadcn components
│   │   ├── web3/               # Wallet connect, chain switch
│   │   ├── dashboard/          # Stats cards, charts
│   │   ├── staking/            # Stake form, tier selector
│   │   ├── dex/                # Sell OSLO interface
│   │   └── team/               # Referral tree visualization
│   ├── hooks/
│   │   ├── useOsloContract.ts
│   │   ├── useStaking.ts
│   │   ├── useYield.ts
│   │   └── useReferral.ts
│   ├── lib/
│   │   ├── contracts/          # ABI files + addresses
│   │   ├── utils/              # Formatters, calculators
│   │   └── config/             # wagmi config, chains
│   └── types/
│       └── index.ts
├── public/
└── package.json
Core Frontend Components
1. Web3 Configuration (lib/config/wagmi.ts)
TypeScript
import { createConfig, http } from 'wagmi';
import { bsc, bscTestnet } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

export const config = createConfig({
  chains: [bsc, bscTestnet],
  connectors: [
    injected({ target: 'metaMask' }),
    walletConnect({ projectId: 'YOUR_PROJECT_ID' }),
  ],
  transports: {
    [bsc.id]: http('https://bsc-dataseed.binance.org/'),
    [bscTestnet.id]: http('https://data-seed-prebsc-1-s1.binance.org:8545/'),
  },
});
2. Contract Hook Pattern (hooks/useStaking.ts)
TypeScript
import { useReadContract, useWriteContract, useAccount } from 'wagmi';
import { investmentEngineABI, INVESTMENT_ENGINE_ADDRESS } from '@/lib/contracts';

export function useStaking() {
  const { address } = useAccount();
  
  // Read user stake
  const { data: userStake } = useReadContract({
    address: INVESTMENT_ENGINE_ADDRESS,
    abi: investmentEngineABI,
    functionName: 'stakes',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  
  // Read accrued yield
  const { data: accruedYield } = useReadContract({
    address: INVESTMENT_ENGINE_ADDRESS,
    abi: investmentEngineABI,
    functionName: 'calculateAccruedYield',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 30000 }, // Refresh every 30s
  });
  
  // Write stake
  const { writeContract: stake, isPending: isStaking } = useWriteContract();
  
  return { userStake, accruedYield, stake, isStaking };
}
3. Dashboard UI Component
TypeScript
// components/dashboard/StakingCard.tsx
export function StakingCard() {
  const { userStake, accruedYield, stake, isStaking } = useStaking();
  const { address } = useAccount();
  
  const activeStake = userStake?.[0] ? formatUSDT(userStake[0]) : '0';
  const totalEarnings = userStake?.[1] ? formatUSDT(userStake[1]) : '0';
  const cap = userStake?.[0] ? formatUSDT(userStake[0] * 3n) : '0';
  const progress = userStake?.[0] && userStake?.[1] 
    ? Number((userStake[1] * 100n) / (userStake[0] * 3n)) 
    : 0;
  
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Your Stake</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between">
          <span>Active Stake</span>
          <span className="font-bold">{activeStake} USDT</span>
        </div>
        <div className="flex justify-between">
          <span>Total Earnings</span>
          <span className="text-green-600">{totalEarnings} USDT</span>
        </div>
        <div className="flex justify-between">
          <span>3X Cap</span>
          <span>{cap} USDT</span>
        </div>
        
        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div 
            className="bg-blue-600 h-2.5 rounded-full transition-all" 
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
        <p className="text-xs text-gray-500">{progress.toFixed(2)}% of cap reached</p>
        
        {/* Yield display */}
        <div className="bg-green-50 p-3 rounded-lg">
          <p className="text-sm text-green-800">
            Accrued Yield: {accruedYield ? formatUSDT(accruedYield) : '0.00'} USDT
          </p>
        </div>
        
        <Button 
          onClick={() => claimYield()} 
          disabled={!accruedYield || accruedYield === 0n}
          className="w-full"
        >
          Claim Yield (Convert to OSLO)
        </Button>
      </CardContent>
    </Card>
  );
}
4. DEX Sell Interface
TypeScript
// components/dex/SellInterface.tsx
export function SellInterface() {
  const [osloAmount, setOsloAmount] = useState('');
  const { data: price } = useReadContract({
    address: OSLO_DEX_ADDRESS,
    abi: osloDexABI,
    functionName: 'getPrice',
  });
  
  const { writeContract: sell } = useWriteContract();
  
  const estimatedUsdt = price && osloAmount 
    ? (BigInt(osloAmount) * price) / BigInt(1e18) 
    : 0n;
  const afterTax = (estimatedUsdt * 90n) / 100n;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sell OSLO</CardTitle>
        <CardDescription>One-way DEX - Sell Only</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input 
          type="number" 
          placeholder="OSLO Amount" 
          value={osloAmount}
          onChange={(e) => setOsloAmount(e.target.value)}
        />
        
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Current Price</span>
            <span>{price ? formatPrice(price) : '---'} USDT/OSLO</span>
          </div>
          <div className="flex justify-between">
            <span>Gross USDT</span>
            <span>{formatUSDT(estimatedUsdt)}</span>
          </div>
          <div className="flex justify-between text-red-500">
            <span>10% Tax</span>
            <span>-{formatUSDT(estimatedUsdt - afterTax)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>You Receive</span>
            <span>{formatUSDT(afterTax)} USDT</span>
          </div>
        </div>
        
        <Button 
          onClick={() => sell({
            address: OSLO_DEX_ADDRESS,
            abi: osloDexABI,
            functionName: 'sellOslo',
            args: [parseUnits(osloAmount, 18)],
          })}
          className="w-full"
          variant="destructive"
        >
          Sell OSLO
        </Button>
      </CardContent>
    </Card>
  );
}
5. Referral Tree Visualization
TypeScript
// components/team/ReferralTree.tsx
export function ReferralTree({ address }: { address: string }) {
  const { data: downlines } = useReadContract({
    address: REFERRAL_REGISTRY_ADDRESS,
    abi: referralRegistryABI,
    functionName: 'getDirectDownlines',
    args: [address],
  });
  
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Direct Team ({downlines?.length || 0})</h3>
      <div className="grid gap-2">
        {downlines?.map((downline: string) => (
          <TeamMemberCard key={downline} address={downline} />
        ))}
      </div>
    </div>
  );
}
Part 4: Security & Testing Strategy
Smart Contract Testing (90%+ Coverage)
Test Structure:
TypeScript
// test/InvestmentEngine.test.ts
describe("InvestmentEngine", () => {
  beforeEach(async () => {
    // Deploy full protocol
    [owner, user1, user2, ...addrs] = await ethers.getSigners();
    
    // Deploy token
    OsloToken = await ethers.getContractFactory("OsloToken");
    osloToken = await OsloToken.deploy();
    
    // Deploy DEX
    OsloDEX = await ethers.getContractFactory("OsloDEX");
    osloDEX = await OsloDEX.deploy(await osloToken.getAddress(), USDT_ADDRESS);
    
    // ... deploy rest of protocol
  });
  
  describe("Staking", () => {
    it("Should split deposit 96/2/1/1", async () => {
      // Test USDT splits
    });
    
    it("Should enforce 3X cap", async () => {
      // Stake, accrue yield, verify cap stops earnings
    });
    
    it("Should calculate 7-day rotation correctly", async () => {
      // Advance time, verify yield rates match tier schedules
    });
  });
  
  describe("Referrals", () => {
    it("Should prevent circular referrals", async () => {
      // A refers B, B refers C, C tries to refer A
    });
    
    it("Should unlock levels based on qualified directs", async () => {
      // Build tree, verify commission distribution
    });
  });
  
  describe("DEX", () => {
    it("Should reject buy attempts", async () => {
      // Verify buyOslo doesn't exist or reverts
    });
    
    it("Should burn 50% and retain 50% on sell", async () => {
      // Sell OSLO, verify reserves and burn
    });
    
    it("Should increase price after sell", async () => {
      // Verify price mechanics
    });
  });
});
Security Checklist
Table
Category	Check	Implementation
Access Control	No unprotected admin functions	All admin functions via Timelock
Reentrancy	NonReentrant on all external	OpenZeppelin ReentrancyGuard
Input Validation	Bounds checking on all inputs	Custom errors, require statements
Arithmetic	No overflow/underflow	Solidity 0.8+ built-in + checks
USDT Safety	Handle non-standard returns	Use SafeERC20.forceApprove
Front-running	Time-weighted operations	Commit-reveal where applicable
Centralization	No single owner	Timelock + multi-sig for admin
Upgradeability	No proxy (immutable)	All contracts non-upgradeable
Events	All state changes emit events	Complete event coverage
Frontend Security
Input Sanitization: Validate all numeric inputs before sending to contracts
Transaction Simulation: Use useSimulateContract before writes
Error Handling: Parse contract revert reasons and display user-friendly messages
Rate Limiting: Debounce rapid contract calls
RPC Fallbacks: Multiple BSC RPC endpoints
Part 5: Deployment & DevOps
Deployment Script (scripts/deploy.ts)
TypeScript
async function main() {
  const [deployer] = await ethers.getSigners();
  
  // 1. Deploy Token
  const OsloToken = await ethers.getContractFactory("OsloToken");
  const osloToken = await OsloToken.deploy();
  await osloToken.waitForDeployment();
  console.log("OsloToken:", await osloToken.getAddress());
  
  // 2. Deploy DEX
  const OsloDEX = await ethers.getContractFactory("OsloDEX");
  const osloDEX = await OsloDEX.deploy(
    await osloToken.getAddress(),
    USDT_MAINNET
  );
  
  // 3. Deploy Registry
  const ReferralRegistry = await ethers.getContractFactory("ReferralRegistry");
  const registry = await ReferralRegistry.deploy();
  
  // 4. Deploy Vault
  const RewardVault = await ethers.getContractFactory("RewardVault");
  const vault = await RewardVault.deploy(USDT_MAINNET, await osloToken.getAddress());
  
  // 5. Deploy Level System
  const LevelIncomeSystem = await ethers.getContractFactory("LevelIncomeSystem");
  const levelSystem = await LevelIncomeSystem.deploy(
    await registry.getAddress(),
    await osloDEX.getAddress(),
    await osloToken.getAddress()
  );
  
  // 6. Deploy Engine
  const InvestmentEngine = await ethers.getContractFactory("InvestmentEngine");
  const engine = await InvestmentEngine.deploy(
    USDT_MAINNET,
    await osloToken.getAddress(),
    await osloDEX.getAddress(),
    await vault.getAddress(),
    await registry.getAddress(),
    await levelSystem.getAddress(),
    COMPANY_WALLET,
    PERF_WALLET
  );
  
  // 7. Deploy DAO
  const OsloDAO = await ethers.getContractFactory("OsloDAO");
  const dao = await OsloDAO.deploy(USDT_MAINNET, await engine.getAddress());
  
  // 8. Wire permissions
  await osloToken.grantRole(BURNER_ROLE, await osloDEX.getAddress());
  await osloToken.grantRole(BURNER_ROLE, await engine.getAddress());
  await vault.grantRole(ENGINE_ROLE, await engine.getAddress());
  
  // 9. Transfer reserves
  await osloToken.transfer(await engine.getAddress(), ethers.parseEther("11000000"));
  await osloToken.transfer(await osloDEX.getAddress(), ethers.parseEther("100000"));
  
  // 10. Seed DEX with 2000 USDT (from deployer)
  // ... USDT transfer to DEX
  
  // 11. Deploy Timelock and transfer ownership
  const Timelock = await ethers.getContractFactory("OsloTimelock");
  const timelock = await Timelock.deploy(86400, [deployer.address], [deployer.address], deployer.address);
  
  await osloToken.grantRole(DEFAULT_ADMIN_ROLE, await timelock.getAddress());
  await osloToken.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);
  
  // Verify all contracts on BSCScan
  // ...
}
CI/CD Pipeline (GitHub Actions)
yaml
name: Test & Deploy
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx hardhat test
      - run: npx hardhat coverage
      
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: npm run lint:sol
      - run: npm run lint:ts
      
  deploy-testnet:
    needs: [test, lint]
    if: github.ref == 'refs/heads/develop'
    steps:
      - run: npx hardhat run scripts/deploy.ts --network bscTestnet
      
  deploy-mainnet:
    needs: [test, lint]
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - run: npx hardhat run scripts/deploy.ts --network bscMainnet
Part 6: Gas Optimization Tips
Use calldata instead of memory for external function array parameters
Pack structs: Put uint128 next to uint128 to save slots
Use unchecked blocks where overflow is impossible (e.g., i++ in loops)
Short-circuit evaluation: Check cheapest conditions first
Batch operations: Allow multi-claim to amortize fixed costs
Event logging: Use events for off-chain data instead of storage
Custom errors instead of strings: error InsufficientBalance() saves ~50 gas vs require(..., "string")
Part 7: Frontend UX Best Practices
Real-time Updates: Use watchBlockNumber to refresh data every block
Pending States: Show transaction status with BSCScan links
Error Translation: Map contract reverts to human-readable messages
Mobile-First: Most DeFi users are on mobile - ensure WalletConnect works flawlessly
Price Oracles: Display live DEX price with 30-second refresh
Referral Links: Auto-generate ?ref=0x... links for easy sharing
Dashboard Analytics:
Total Value Locked (TVL)
OSLO price chart
Burn tracker (total burned vs floor)
Personal 3X cap progress
Summary Checklist
Backend Deliverables
[ ] 8 Solidity contracts with NatSpec
[ ] Hardhat project with BSC config
[ ] 100% test coverage on core math
[ ] Deployment scripts with verification
[ ] Security audit prep (Slither, Mythril)
[ ] ABI exports for frontend
Frontend Deliverables
[ ] Next.js app with Wagmi integration
[ ] Responsive dashboard (mobile + desktop)
[ ] Staking interface with tier selection
[ ] DEX sell-only interface
[ ] Referral tree viewer
[ ] DAO qualification tracker
[ ] Admin panel for protocol stats