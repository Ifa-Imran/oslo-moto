import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("OSLOTreasury", function () {
  let busd: any;
  let osloToken: any;
  let treasury: any;
  let rankSystem: any;
  let dao: any;
  let liquidityManager: any;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;

  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();

    const MockBUSD = await ethers.getContractFactory("MockBUSD");
    busd = await MockBUSD.deploy();

    const OSLOToken = await ethers.getContractFactory("OSLOToken");
    osloToken = await OSLOToken.deploy();

    const MockRouter = await ethers.getContractFactory("MockPancakeRouter");
    const router = await MockRouter.deploy();

    const LM = await ethers.getContractFactory("OSLOLiquidityManager");
    liquidityManager = await LM.deploy(await busd.getAddress(), await osloToken.getAddress(), await router.getAddress());

    const RankSystem = await ethers.getContractFactory("OSLORankSystem");
    rankSystem = await RankSystem.deploy(await busd.getAddress());

    const OSLODAO = await ethers.getContractFactory("OSLODAO");
    dao = await OSLODAO.deploy(await busd.getAddress());

    const Treasury = await ethers.getContractFactory("OSLOTreasury");
    treasury = await Treasury.deploy(await busd.getAddress(), await osloToken.getAddress());

    // Configure
    await treasury.configure(
      await rankSystem.getAddress(),
      await dao.getAddress(),
      await liquidityManager.getAddress(),
      owner.address
    );

    // Fund router with OSLO for swaps
    await osloToken.transfer(await router.getAddress(), ethers.parseEther("1000000"));

    // Mint BUSD for testing
    await busd.mint(owner.address, ethers.parseEther("1000000"));
    await busd.approve(await treasury.getAddress(), ethers.MaxUint256);
  });

  describe("Receive Fees", function () {
    it("should accept fees", async function () {
      await treasury.receiveFees(ethers.parseEther("1000"));
      expect(await treasury.totalReceived()).to.equal(ethers.parseEther("1000"));
      expect(await treasury.pendingDistribution()).to.equal(ethers.parseEther("1000"));
    });
  });

  describe("Distribution", function () {
    it("should distribute fees 70/20/10 split", async function () {
      await treasury.receiveFees(ethers.parseEther("10000"));

      const rankBefore = await busd.balanceOf(await rankSystem.getAddress());
      const daoBefore = await busd.balanceOf(await dao.getAddress());

      await treasury.distribute();

      const rankAfter = await busd.balanceOf(await rankSystem.getAddress());
      const daoAfter = await busd.balanceOf(await dao.getAddress());

      // 70% to rank = 7000
      expect(rankAfter - rankBefore).to.equal(ethers.parseEther("7000"));
      // 20% to DAO = 2000
      expect(daoAfter - daoBefore).to.equal(ethers.parseEther("2000"));
    });

    it("should revert when nothing to distribute", async function () {
      await expect(
        treasury.distribute()
      ).to.be.revertedWithCustomError(treasury, "NothingToDistribute");
    });

    it("should be callable by anyone (permissionless)", async function () {
      await treasury.receiveFees(ethers.parseEther("1000"));
      await treasury.connect(user1).distribute(); // user1 can distribute
    });
  });

  describe("Rescue", function () {
    it("should reject rescue of BUSD", async function () {
      await expect(
        treasury.rescueERC20(await busd.getAddress(), 100)
      ).to.be.revertedWithCustomError(treasury, "CannotRescueProtocolTokens");
    });

    it("should reject rescue of OSLO", async function () {
      await expect(
        treasury.rescueERC20(await osloToken.getAddress(), 100)
      ).to.be.revertedWithCustomError(treasury, "CannotRescueProtocolTokens");
    });

    it("should reject rescue from non-timelock", async function () {
      const randomToken = await (await ethers.getContractFactory("MockBUSD")).deploy();
      await expect(
        treasury.connect(user1).rescueERC20(await randomToken.getAddress(), 100)
      ).to.be.revertedWithCustomError(treasury, "OnlyTimelock");
    });
  });

  describe("Setup", function () {
    it("should reject configuration after setup complete", async function () {
      await treasury.completeSetup();
      await expect(
        treasury.configure(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(treasury, "OnlyAdmin");
    });
  });
});
