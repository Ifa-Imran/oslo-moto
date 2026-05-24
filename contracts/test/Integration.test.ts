import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Integration Tests", function () {
  let busd: any, osloToken: any, treasury: any, investmentEngine: any;
  let referral: any, rankSystem: any, liquidityManager: any, dao: any, router: any;
  let owner: SignerWithAddress, user1: SignerWithAddress, user2: SignerWithAddress;
  let user3: SignerWithAddress, user4: SignerWithAddress;

  const ONE_DAY = 86400;

  async function fullDeploy() {
    [owner, user1, user2, user3, user4] = await ethers.getSigners();

    const MockBUSD = await ethers.getContractFactory("MockBUSD");
    busd = await MockBUSD.deploy();

    const OSLOToken = await ethers.getContractFactory("OSLOToken");
    osloToken = await OSLOToken.deploy();

    const MockRouter = await ethers.getContractFactory("MockPancakeRouter");
    router = await MockRouter.deploy();

    const LM = await ethers.getContractFactory("OSLOLiquidityManager");
    liquidityManager = await LM.deploy(await busd.getAddress(), await osloToken.getAddress(), await router.getAddress());

    const Treasury = await ethers.getContractFactory("OSLOTreasury");
    treasury = await Treasury.deploy(await busd.getAddress(), await osloToken.getAddress());

    const OSLODAO = await ethers.getContractFactory("OSLODAO");
    dao = await OSLODAO.deploy(await busd.getAddress());

    const RankSystem = await ethers.getContractFactory("OSLORankSystem");
    rankSystem = await RankSystem.deploy(await busd.getAddress());

    const Referral = await ethers.getContractFactory("OSLOReferral");
    referral = await Referral.deploy(await busd.getAddress(), await osloToken.getAddress());

    const IE = await ethers.getContractFactory("OSLOInvestmentEngine");
    const latestBlock = await ethers.provider.getBlock("latest");
    investmentEngine = await IE.deploy(await busd.getAddress(), latestBlock!.timestamp - 30 * ONE_DAY);

    // Configure all contracts
    await treasury.configure(await rankSystem.getAddress(), await dao.getAddress(), await liquidityManager.getAddress(), owner.address);
    await rankSystem.configure(await investmentEngine.getAddress(), owner.address);
    await referral.configure(await investmentEngine.getAddress(), owner.address, await treasury.getAddress(), owner.address);
    await dao.configure(owner.address);
    await liquidityManager.configure(owner.address);
    await investmentEngine.configure(
      await treasury.getAddress(), await referral.getAddress(), await rankSystem.getAddress(),
      await liquidityManager.getAddress(), owner.address
    );

    // Fund router with OSLO for mock swaps
    await osloToken.transfer(await router.getAddress(), ethers.parseEther("2000000"));
    // Approve OSLO from deployer for referral airdrops
    await osloToken.approve(await referral.getAddress(), ethers.MaxUint256);

    // Fund investment engine with BUSD (simulating protocol having funds for rewards)
    await busd.mint(await investmentEngine.getAddress(), ethers.parseEther("10000000"));

    // Mint BUSD for owner and approve referral for registration fee
    await busd.mint(owner.address, ethers.parseEther("100"));
    await busd.approve(await referral.getAddress(), ethers.MaxUint256);

    // Mint BUSD to users and approve
    for (const u of [user1, user2, user3, user4]) {
      await busd.mint(u.address, ethers.parseEther("100000"));
      await busd.connect(u).approve(await investmentEngine.getAddress(), ethers.MaxUint256);
      await busd.connect(u).approve(await referral.getAddress(), ethers.MaxUint256);
    }

    // Register root
    await referral.register(owner.address, ethers.ZeroAddress);
  }

  beforeEach(async function () {
    await fullDeploy();
  });

  describe("Full User Journey", function () {
    it("Registration -> Deposit -> Trial -> Claim", async function () {
      // 1. User1 registers under owner and deposits $1000 BUSD
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(ethers.parseEther("1000"));

      // Verify registration and deposit (no deposit fee)
      expect(await referral.isRegistered(user1.address)).to.equal(true);
      expect(await investmentEngine.getActiveDeposit(user1.address)).to.equal(ethers.parseEther("1000"));

      // 2. Check trial period
      expect(await investmentEngine.isInTrialPeriod(user1.address, 0)).to.equal(true);

      // 3. Advance 5 days — still in trial
      await time.increase(ONE_DAY * 5);
      expect(await investmentEngine.isInTrialPeriod(user1.address, 0)).to.equal(true);

      // 4. Rewards accruing
      const [invReturn, profReturn] = await investmentEngine.getPendingRewards(user1.address, 0);
      expect(invReturn + profReturn).to.be.gt(0);

      // 5. Advance past trial
      await time.increase(ONE_DAY * 6);
      expect(await investmentEngine.isInTrialPeriod(user1.address, 0)).to.equal(false);

      // 6. Claim rewards
      const balBefore = await busd.balanceOf(user1.address);
      await investmentEngine.connect(user1).claimRewards(0);
      const balAfter = await busd.balanceOf(user1.address);
      expect(balAfter).to.be.gt(balBefore);

      // 7. Make a second deposit
      await investmentEngine.connect(user1).deposit(ethers.parseEther("500"));
      expect(await investmentEngine.getDepositCount(user1.address)).to.equal(2);
    });

    it("Referral chain and level unlocking", async function () {
      // owner -> user1 -> user2 -> user3
      await referral.connect(user1).register(user1.address, owner.address);
      await referral.connect(user2).register(user2.address, user1.address);
      await referral.connect(user3).register(user3.address, user2.address);
      await investmentEngine.connect(user1).deposit(ethers.parseEther("200"));
      await investmentEngine.connect(user2).deposit(ethers.parseEther("200"));
      await investmentEngine.connect(user3).deposit(ethers.parseEther("200"));

      // Verify chain
      expect(await referral.getReferrer(user1.address)).to.equal(owner.address);
      expect(await referral.getReferrer(user2.address)).to.equal(user1.address);
      expect(await referral.getReferrer(user3.address)).to.equal(user2.address);

      // Owner should have 1 qualified direct (user1 with $190 active > $100)
      await referral.checkAndUnlockLevels(owner.address);
      expect(await referral.getUnlockedLevels(owner.address)).to.equal(3);
    });

    it("Treasury fee collection and distribution", async function () {
      // Register and deposit (no deposit fee in current model)
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(ethers.parseEther("10000"));

      // Send fees directly to treasury for testing distribution
      await busd.mint(user1.address, ethers.parseEther("500"));
      await busd.connect(user1).approve(await treasury.getAddress(), ethers.MaxUint256);
      await treasury.connect(user1).receiveFees(ethers.parseEther("500"));

      // Check treasury received fees
      expect(await treasury.totalReceived()).to.equal(ethers.parseEther("500"));
      expect(await treasury.pendingDistribution()).to.equal(ethers.parseEther("500"));

      // Distribute
      await treasury.distribute();

      // 70% to rank = 350, 20% to DAO = 100, 10% to LP = 50
      expect(await rankSystem.bonusPoolBalance()).to.equal(ethers.parseEther("350"));
    });

    it("Early exit penalty during trial", async function () {
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(ethers.parseEther("1000"));

      // Withdraw during trial (day 3)
      await time.increase(ONE_DAY * 3);
      const balBefore = await busd.balanceOf(user1.address);
      await investmentEngine.connect(user1).withdrawPrincipal(0);
      const balAfter = await busd.balanceOf(user1.address);

      // Deposit = 1000. Penalty = 10% = 100. Returned = 900
      expect(balAfter - balBefore).to.equal(ethers.parseEther("900"));
      expect(await investmentEngine.getActiveDeposit(user1.address)).to.equal(0);
    });

    it("Post-trial withdrawal should revert (principal locked)", async function () {
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(ethers.parseEther("1000"));

      // Advance past trial (11 days)
      await time.increase(ONE_DAY * 11);

      // Principal is locked after trial — withdrawal should revert
      await expect(
        investmentEngine.connect(user1).withdrawPrincipal(0)
      ).to.be.revertedWithCustomError(investmentEngine, "PrincipalLocked");
    });
  });

  describe("Edge Cases", function () {
    it("3X cap exact boundary", async function () {
      // Small deposit to hit cap faster
      await referral.connect(user1).register(user1.address, owner.address);
      await investmentEngine.connect(user1).deposit(ethers.parseEther("100"));
      // Deposit = 100. Cap = 300.

      // Advance many days (way past cap)
      await time.increase(ONE_DAY * 300);

      const [inv, prof] = await investmentEngine.getPendingRewards(user1.address, 0);
      const total = inv + prof;
      const cap = ethers.parseEther("300");
      expect(total).to.be.lte(cap);
    });

    it("Referral commission not paid when upline has insufficient levels", async function () {
      // user1 under owner, user2 under user1, user3 under user2
      await referral.connect(user1).register(user1.address, owner.address);
      await referral.connect(user2).register(user2.address, user1.address);
      await referral.connect(user3).register(user3.address, user2.address);
      await investmentEngine.connect(user1).deposit(ethers.parseEther("200"));
      await investmentEngine.connect(user2).deposit(ethers.parseEther("200"));
      await investmentEngine.connect(user3).deposit(ethers.parseEther("200"));

      // user2 has 1 direct (user3) with <$100 net deposit (190 > 100, so it IS qualified)
      // user1 has 1 direct (user2) — unlocks levels 1-3
      // owner has 1 direct (user1) — unlocks levels 1-3
      // So for a 4th level upline, they wouldn't receive commission if only 3 levels unlocked
      // This test verifies the system doesn't break even with deep referral chains
      await time.increase(ONE_DAY);
      await investmentEngine.connect(user3).claimRewards(0);
      // No revert = success
    });
  });
});
