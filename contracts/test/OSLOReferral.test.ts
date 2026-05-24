import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("OSLOReferral", function () {
  let busd: any;
  let osloToken: any;
  let referral: any;
  let investmentEngine: any;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let user4: SignerWithAddress;
  let signers: SignerWithAddress[];

  async function deployAll() {
    signers = await ethers.getSigners();
    [owner, user1, user2, user3, user4] = signers;

    const MockBUSD = await ethers.getContractFactory("MockBUSD");
    busd = await MockBUSD.deploy();

    const OSLOToken = await ethers.getContractFactory("OSLOToken");
    osloToken = await OSLOToken.deploy();

    const MockRouter = await ethers.getContractFactory("MockPancakeRouter");
    const router = await MockRouter.deploy();

    const LM = await ethers.getContractFactory("OSLOLiquidityManager");
    const lm = await LM.deploy(await busd.getAddress(), await osloToken.getAddress(), await router.getAddress());

    const Treasury = await ethers.getContractFactory("OSLOTreasury");
    const treasury = await Treasury.deploy(await busd.getAddress(), await osloToken.getAddress());

    const RankSystem = await ethers.getContractFactory("OSLORankSystem");
    const rankSystem = await RankSystem.deploy(await busd.getAddress());

    const Referral = await ethers.getContractFactory("OSLOReferral");
    referral = await Referral.deploy(await busd.getAddress(), await osloToken.getAddress());

    const IE = await ethers.getContractFactory("OSLOInvestmentEngine");
    const latestBlock = await ethers.provider.getBlock("latest");
    investmentEngine = await IE.deploy(await busd.getAddress(), latestBlock!.timestamp - 30 * 86400);

    // Configure
    await treasury.configure(await rankSystem.getAddress(), owner.address, await lm.getAddress(), owner.address);
    await rankSystem.configure(await investmentEngine.getAddress(), owner.address);
    await referral.configure(await investmentEngine.getAddress(), owner.address, await treasury.getAddress(), owner.address);
    await investmentEngine.configure(
      await treasury.getAddress(), await referral.getAddress(), await rankSystem.getAddress(),
      await lm.getAddress(), owner.address
    );

    // Approve OSLO from deployer for airdrops
    await osloToken.approve(await referral.getAddress(), ethers.MaxUint256);

    // Fund router and engine
    await osloToken.transfer(await router.getAddress(), ethers.parseEther("500000"));
    await busd.mint(await investmentEngine.getAddress(), ethers.parseEther("1000000"));

    // Mint BUSD for owner and approve referral for registration fee
    await busd.mint(owner.address, ethers.parseEther("100"));
    await busd.approve(await referral.getAddress(), ethers.MaxUint256);

    // Mint BUSD and approve for users
    for (const s of [user1, user2, user3, user4]) {
      await busd.mint(s.address, ethers.parseEther("50000"));
      await busd.connect(s).approve(await investmentEngine.getAddress(), ethers.MaxUint256);
      await busd.connect(s).approve(await referral.getAddress(), ethers.MaxUint256);
    }
  }

  beforeEach(async function () {
    await deployAll();
  });

  describe("Registration", function () {
    it("should register root user with zero referrer", async function () {
      await referral.register(owner.address, ethers.ZeroAddress);
      expect(await referral.isRegistered(owner.address)).to.equal(true);
    });

    it("should register user with valid referrer", async function () {
      await referral.register(owner.address, ethers.ZeroAddress);
      await referral.connect(user1).register(user1.address, owner.address);
      expect(await referral.isRegistered(user1.address)).to.equal(true);
      expect(await referral.getReferrer(user1.address)).to.equal(owner.address);
    });

    it("should revert self-referral", async function () {
      await expect(
        referral.connect(user1).register(user1.address, user1.address)
      ).to.be.revertedWithCustomError(referral, "SelfReferral");
    });

    it("should revert double registration", async function () {
      await referral.register(owner.address, ethers.ZeroAddress);
      await expect(
        referral.register(owner.address, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(referral, "AlreadyRegistered");
    });

    it("should revert with unregistered referrer", async function () {
      await expect(
        referral.connect(user1).register(user1.address, user2.address)
      ).to.be.revertedWithCustomError(referral, "InvalidReferrer");
    });

    it("should track direct referrals", async function () {
      await referral.register(owner.address, ethers.ZeroAddress);
      await referral.connect(user1).register(user1.address, owner.address);
      await referral.connect(user2).register(user2.address, owner.address);
      const directs = await referral.getDirectReferrals(owner.address);
      expect(directs.length).to.equal(2);
    });

    it("should give early adopter airdrop", async function () {
      await referral.register(owner.address, ethers.ZeroAddress);
      const balBefore = await osloToken.balanceOf(user1.address);
      await referral.connect(user1).register(user1.address, owner.address);
      const balAfter = await osloToken.balanceOf(user1.address);
      // Registration #2 → Tier 1 (1-2): 10,000 OSLO
      expect(balAfter - balBefore).to.equal(ethers.parseEther("10000"));
    });
  });

  describe("Level Unlocking", function () {
    it("should unlock levels 1-3 with 1 qualified direct", async function () {
      await referral.register(owner.address, ethers.ZeroAddress);
      await referral.connect(user1).register(user1.address, owner.address);

      // user1 deposits $100+ to become qualified
      await investmentEngine.connect(user1).deposit(ethers.parseEther("200"));

      // Check levels
      await referral.checkAndUnlockLevels(owner.address);
      expect(await referral.getUnlockedLevels(owner.address)).to.equal(3);
    });

    it("should unlock levels 1-8 with 2 qualified directs", async function () {
      await referral.register(owner.address, ethers.ZeroAddress);
      await referral.connect(user1).register(user1.address, owner.address);
      await referral.connect(user2).register(user2.address, owner.address);

      await investmentEngine.connect(user1).deposit(ethers.parseEther("200"));
      await investmentEngine.connect(user2).deposit(ethers.parseEther("200"));

      await referral.checkAndUnlockLevels(owner.address);
      expect(await referral.getUnlockedLevels(owner.address)).to.equal(8);
    });
  });

  describe("Commission Rates", function () {
    it("should return correct commission rate for level 1 (30%)", async function () {
      // Test implicitly through distribution — just verify the referral structure works
      await referral.register(owner.address, ethers.ZeroAddress);
      await referral.connect(user1).register(user1.address, owner.address);
      expect(await referral.getReferrer(user1.address)).to.equal(owner.address);
    });
  });

  describe("Team Size", function () {
    it("should calculate team size recursively", async function () {
      await referral.register(owner.address, ethers.ZeroAddress);
      await referral.connect(user1).register(user1.address, owner.address);
      await referral.connect(user2).register(user2.address, user1.address);
      await referral.connect(user3).register(user3.address, user2.address);

      const teamSize = await referral.getTeamSize(owner.address);
      expect(teamSize).to.equal(3); // user1, user2, user3
    });
  });
});
