import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("OSLORankSystem", function () {
  let busd: any;
  let rankSystem: any;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;

  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();

    const MockBUSD = await ethers.getContractFactory("MockBUSD");
    busd = await MockBUSD.deploy();

    const RankSystem = await ethers.getContractFactory("OSLORankSystem");
    rankSystem = await RankSystem.deploy(await busd.getAddress());

    await rankSystem.configure(owner.address, owner.address); // owner acts as engine + timelock

    // Fund bonus pool
    await busd.mint(owner.address, ethers.parseEther("10000000"));
    await busd.approve(await rankSystem.getAddress(), ethers.MaxUint256);
    await rankSystem.receiveBonusPool(ethers.parseEther("1000000"));
  });

  describe("Turnover Recording", function () {
    it("should record turnover for current week", async function () {
      await rankSystem.recordTurnover(user1.address, ethers.parseEther("10000"));
      const weekId = await rankSystem.getCurrentWeekId();
      const turnover = await rankSystem.getWeeklyTurnover(user1.address, weekId);
      expect(turnover).to.equal(ethers.parseEther("10000"));
    });

    it("should accumulate turnover within same week", async function () {
      await rankSystem.recordTurnover(user1.address, ethers.parseEther("5000"));
      await rankSystem.recordTurnover(user1.address, ethers.parseEther("5000"));
      const weekId = await rankSystem.getCurrentWeekId();
      expect(await rankSystem.getWeeklyTurnover(user1.address, weekId)).to.equal(ethers.parseEther("10000"));
    });
  });

  describe("Rank Calculation", function () {
    it("should return rank 0 with no turnover", async function () {
      expect(await rankSystem.getCurrentRank(user1.address)).to.equal(0);
    });

    it("should return rank 1 at $10,000 turnover", async function () {
      await rankSystem.recordTurnover(user1.address, ethers.parseEther("10000"));
      expect(await rankSystem.getCurrentRank(user1.address)).to.equal(1);
    });

    it("should return rank 3 at $75,000 turnover", async function () {
      await rankSystem.recordTurnover(user1.address, ethers.parseEther("75000"));
      expect(await rankSystem.getCurrentRank(user1.address)).to.equal(3);
    });

    it("should return rank 7 at $2,500,000+ turnover", async function () {
      await rankSystem.recordTurnover(user1.address, ethers.parseEther("2500000"));
      expect(await rankSystem.getCurrentRank(user1.address)).to.equal(7);
    });
  });

  describe("Bonus Claiming", function () {
    it("should allow claiming bonus for completed week", async function () {
      await rankSystem.recordTurnover(user1.address, ethers.parseEther("10000"));

      // Advance past the week
      await time.increase(7 * 86400 + 1);

      const balBefore = await busd.balanceOf(user1.address);
      await rankSystem.connect(user1).claimRankBonus();
      const balAfter = await busd.balanceOf(user1.address);

      // Rank 1: 1% of $10,000 = $100
      expect(balAfter - balBefore).to.equal(ethers.parseEther("100"));
    });

    it("should not allow claiming for current week", async function () {
      await rankSystem.recordTurnover(user1.address, ethers.parseEther("10000"));
      await expect(
        rankSystem.connect(user1).claimRankBonus()
      ).to.be.revertedWithCustomError(rankSystem, "NoBonus");
    });

    it("should not allow double claiming", async function () {
      await rankSystem.recordTurnover(user1.address, ethers.parseEther("10000"));
      await time.increase(7 * 86400 + 1);
      await rankSystem.connect(user1).claimRankBonus();

      await expect(
        rankSystem.connect(user1).claimRankBonus()
      ).to.be.revertedWithCustomError(rankSystem, "AlreadyClaimed");
    });
  });

  describe("Rank Downgrade", function () {
    it("should downgrade rank when turnover drops", async function () {
      await rankSystem.recordTurnover(user1.address, ethers.parseEther("75000"));
      expect(await rankSystem.getCurrentRank(user1.address)).to.equal(3);

      // Next week — lower turnover
      await time.increase(7 * 86400 + 1);
      await rankSystem.recordTurnover(user1.address, ethers.parseEther("5000"));
      expect(await rankSystem.getCurrentRank(user1.address)).to.equal(0);
    });
  });
});
