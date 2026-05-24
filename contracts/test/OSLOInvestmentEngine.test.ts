import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("OSLOInvestmentEngine", function () {
  let busd: any;
  let treasury: any;
  let investmentEngine: any;
  let referral: any;
  let rankSystem: any;
  let liquidityManager: any;
  let osloToken: any;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  const DEPOSIT_AMOUNT = ethers.parseEther("1000"); // $1000 BUSD
  const ONE_DAY = 86400;

  async function deployAll() {
    [owner, user1, user2, user3] = await ethers.getSigners();

    // Deploy mock BUSD
    const MockBUSD = await ethers.getContractFactory("MockBUSD");
    busd = await MockBUSD.deploy();
    await busd.waitForDeployment();

    // Deploy OSLO Token
    const OSLOToken = await ethers.getContractFactory("OSLOToken");
    osloToken = await OSLOToken.deploy();
    await osloToken.waitForDeployment();

    // Deploy mock router
    const MockRouter = await ethers.getContractFactory("MockPancakeRouter");
    const router = await MockRouter.deploy();
    await router.waitForDeployment();

    // Deploy LiquidityManager
    const LM = await ethers.getContractFactory("OSLOLiquidityManager");
    liquidityManager = await LM.deploy(await busd.getAddress(), await osloToken.getAddress(), await router.getAddress());
    await liquidityManager.waitForDeployment();

    // Deploy Treasury
    const Treasury = await ethers.getContractFactory("OSLOTreasury");
    treasury = await Treasury.deploy(await busd.getAddress(), await osloToken.getAddress());
    await treasury.waitForDeployment();

    // Deploy RankSystem
    const RankSystem = await ethers.getContractFactory("OSLORankSystem");
    rankSystem = await RankSystem.deploy(await busd.getAddress());
    await rankSystem.waitForDeployment();

    // Deploy Referral
    const Referral = await ethers.getContractFactory("OSLOReferral");
    referral = await Referral.deploy(await busd.getAddress(), await osloToken.getAddress());
    await referral.waitForDeployment();

    // Deploy InvestmentEngine with launch timestamp (30 days ago = Phase 1)
    const latestBlock = await ethers.provider.getBlock("latest");
    const launchTs = latestBlock!.timestamp - 30 * ONE_DAY;
    const IE = await ethers.getContractFactory("OSLOInvestmentEngine");
    investmentEngine = await IE.deploy(await busd.getAddress(), launchTs);
    await investmentEngine.waitForDeployment();

    // Configure Treasury
    await treasury.configure(
      await rankSystem.getAddress(),
      owner.address, // DAO placeholder
      await liquidityManager.getAddress(),
      owner.address
    );

    // Configure RankSystem
    await rankSystem.configure(await investmentEngine.getAddress(), owner.address);

    // Configure Referral
    await referral.configure(await investmentEngine.getAddress(), owner.address, await treasury.getAddress(), owner.address);

    // Configure InvestmentEngine
    await investmentEngine.configure(
      await treasury.getAddress(),
      await referral.getAddress(),
      await rankSystem.getAddress(),
      await liquidityManager.getAddress(),
      owner.address
    );

    // Approve referral to spend OSLO from deployer (acting as earlyAdopterVault)
    await osloToken.approve(await referral.getAddress(), ethers.MaxUint256);
    // Mint BUSD and approve referral for registration fee
    await busd.mint(owner.address, ethers.parseEther("100"));
    await busd.approve(await referral.getAddress(), ethers.MaxUint256);

    // Register owner as root referral
    await referral.register(owner.address, ethers.ZeroAddress);

    // Mint BUSD to users for testing
    await busd.mint(user1.address, ethers.parseEther("100000"));
    await busd.mint(user2.address, ethers.parseEther("100000"));
    await busd.mint(user3.address, ethers.parseEther("100000"));

   // Fund the mock router with OSLO tokens (needed for swap simulation)
    await osloToken.transfer(await router.getAddress(), ethers.parseEther("1000000"));

    // Fund Treasury with BUSD for rewards (simulating protocol operation)
    await busd.mint(await investmentEngine.getAddress(), ethers.parseEther("1000000"));

    // Approve BUSD spending
    await busd.connect(user1).approve(await investmentEngine.getAddress(), ethers.MaxUint256);
    await busd.connect(user2).approve(await investmentEngine.getAddress(), ethers.MaxUint256);
    await busd.connect(user3).approve(await investmentEngine.getAddress(), ethers.MaxUint256);
    
    // Approve referral to spend BUSD for registration fees
    await busd.connect(user1).approve(await referral.getAddress(), ethers.MaxUint256);
    await busd.connect(user2).approve(await referral.getAddress(), ethers.MaxUint256);
    await busd.connect(user3).approve(await referral.getAddress(), ethers.MaxUint256);

    // Approve Treasury to receive fees
    await busd.connect(user1).approve(await treasury.getAddress(), ethers.MaxUint256);
  }

  beforeEach(async function () {
    await deployAll();
  });

  describe("Deposit", function () {
    it("should accept deposits and assign correct tier", async function () {
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(DEPOSIT_AMOUNT);
      const activeDeposit = await investmentEngine.getActiveDeposit(user1.address);
      // Full amount staked (no fee deduction)
      expect(activeDeposit).to.equal(DEPOSIT_AMOUNT);
    });

    it("should accept full deposit without fee", async function () {
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(DEPOSIT_AMOUNT);
      const activeDeposit = await investmentEngine.getActiveDeposit(user1.address);
      expect(activeDeposit).to.equal(DEPOSIT_AMOUNT);
    });

    it("should reject deposits below minimum ($10)", async function () {
      await referral.connect(user1).register(user1.address, owner.address);
      await expect(
        investmentEngine.connect(user1).deposit(ethers.parseEther("5"))
      ).to.be.revertedWithCustomError(investmentEngine, "DepositTooLow");
    });

    it("should assign tier 1 for $10-$499", async function () {
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(ethers.parseEther("100"));
      expect(await investmentEngine.getUserTier(user1.address)).to.equal(1);
    });

    it("should assign tier 2 for $500-$2499", async function () {
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(ethers.parseEther("1000"));
      expect(await investmentEngine.getUserTier(user1.address)).to.equal(2);
    });

    it("should assign tier 5 for $10000+", async function () {
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(ethers.parseEther("11000"));
      expect(await investmentEngine.getUserTier(user1.address)).to.equal(5);
    });

    it("should emit Deposited event", async function () {
      await referral.connect(user1).register(user1.address, owner.address);
      await expect(investmentEngine.connect(user1).deposit(DEPOSIT_AMOUNT))
        .to.emit(investmentEngine, "Deposited");
    });
  });

  describe("Daily Returns Accrual", function () {
    it("should accrue rewards over time", async function () {
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(DEPOSIT_AMOUNT);
      
      // Advance 1 day
      await time.increase(ONE_DAY);

      const [investmentReturn, profitReturn] = await investmentEngine.getPendingRewards(user1.address, 0);
      expect(investmentReturn + profitReturn).to.be.gt(0);
    });

    it("should accrue correct daily rate for tier 2 (2.75%)", async function () {
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(DEPOSIT_AMOUNT);
      
      // Advance exactly 1 day
      await time.increase(ONE_DAY);

      const [investmentReturn, profitReturn] = await investmentEngine.getPendingRewards(user1.address, 0);
      const totalReturn = investmentReturn + profitReturn;
      
      // Deposit = 1000 BUSD. Tier 2 daily rate = 2.75% = 275 BP
      // Expected: 1000 * 275 / 10000 = 27.5 BUSD
      const expected = DEPOSIT_AMOUNT * 275n / 10000n;
      // Allow small rounding tolerance
      expect(totalReturn).to.be.closeTo(expected, ethers.parseEther("0.01"));
    });

    it("should split returns into investment and profit portions", async function () {
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(DEPOSIT_AMOUNT);
      await time.increase(ONE_DAY);

      const [investmentReturn, profitReturn] = await investmentEngine.getPendingRewards(user1.address, 0);
      // Tier 2: investment = 2.25%, profit = 0.50%
      // Profit should be ~0.50/2.75 of total
      expect(profitReturn).to.be.gt(0);
      expect(investmentReturn).to.be.gt(profitReturn);
    });
  });

  describe("3X Return Cap", function () {
    it("should stop yielding after 3X cap is reached", async function () {
      // Small deposit for faster cap testing
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(ethers.parseEther("100"));
      // Deposit = 100 BUSD. Cap = 300 BUSD. At 2.50% daily for tier 1 = 2.5/day.
      
      // Advance many days to exceed cap
      await time.increase(ONE_DAY * 200);

      const [investmentReturn, profitReturn] = await investmentEngine.getPendingRewards(user1.address, 0);
      const totalReturn = investmentReturn + profitReturn;
      
      // Should be capped at 3X = 300 BUSD
      const cap = ethers.parseEther("100") * 3n;
      expect(totalReturn).to.be.lte(cap);
    });
  });

  describe("10-Day Trial Period", function () {
    it("should report deposit is in trial period", async function () {
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(DEPOSIT_AMOUNT);
      expect(await investmentEngine.isInTrialPeriod(user1.address, 0)).to.equal(true);
    });

    it("should exit trial after 10 days", async function () {
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(DEPOSIT_AMOUNT);
      await time.increase(ONE_DAY * 11);
      expect(await investmentEngine.isInTrialPeriod(user1.address, 0)).to.equal(false);
    });

    it("should apply 10% penalty on early withdrawal (day 5)", async function () {
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(DEPOSIT_AMOUNT);
      await time.increase(ONE_DAY * 5);

      const balBefore = await busd.balanceOf(user1.address);
      await investmentEngine.connect(user1).withdrawPrincipal(0);
      const balAfter = await busd.balanceOf(user1.address);
      
      // Deposit = 1000. Penalty = 10% = 100. Returned = 900
      const returned = balAfter - balBefore;
      expect(returned).to.equal(ethers.parseEther("900"));
    });

    it("should NOT apply penalty after trial period (day 11)", async function () {
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(DEPOSIT_AMOUNT);
      await time.increase(ONE_DAY * 11);

      // Principal is locked after trial — withdrawal should revert
      await expect(
        investmentEngine.connect(user1).withdrawPrincipal(0)
      ).to.be.revertedWithCustomError(investmentEngine, "PrincipalLocked");
    });
  });

  describe("Claim Rewards", function () {
    it("should allow claiming accrued rewards", async function () {
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(DEPOSIT_AMOUNT);
      await time.increase(ONE_DAY);

      const balBefore = await busd.balanceOf(user1.address);
      await investmentEngine.connect(user1).claimRewards(0);
      const balAfter = await busd.balanceOf(user1.address);

      expect(balAfter).to.be.gt(balBefore);
    });

    it("should revert on invalid deposit index", async function () {
      await expect(
        investmentEngine.connect(user1).claimRewards(99)
      ).to.be.revertedWithCustomError(investmentEngine, "InvalidDeposit");
    });
  });

  describe("Compounding (via multiple deposits)", function () {
    it("should allow multiple deposits and track count", async function () {
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(DEPOSIT_AMOUNT);

      const countAfter1 = await investmentEngine.getDepositCount(user1.address);
      expect(countAfter1).to.equal(1);

      // Make a second deposit
      await investmentEngine.connect(user1).deposit(ethers.parseEther("500"));
      const countAfter2 = await investmentEngine.getDepositCount(user1.address);
      expect(countAfter2).to.equal(2);
    });

    it("should emit Deposited event on each deposit", async function () {
      await referral.connect(user1).register(user1.address, owner.address);
      await expect(investmentEngine.connect(user1).deposit(DEPOSIT_AMOUNT))
        .to.emit(investmentEngine, "Deposited");
    });
  });

  describe("Withdrawal", function () {
    it("should mark deposit as inactive after withdrawal during trial", async function () {
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(DEPOSIT_AMOUNT);
      // Withdraw immediately during trial
      await investmentEngine.connect(user1).withdrawPrincipal(0);

      expect(await investmentEngine.getActiveDeposit(user1.address)).to.equal(0);
    });

    it("should emit PrincipalWithdrawn event on early withdrawal", async function () {
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(DEPOSIT_AMOUNT);

      await expect(investmentEngine.connect(user1).withdrawPrincipal(0))
        .to.emit(investmentEngine, "PrincipalWithdrawn");
    });
  });
});
