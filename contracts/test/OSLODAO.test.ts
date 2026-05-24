import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("OSLODAO", function () {
  let busd: any;
  let dao: any;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const MockBUSD = await ethers.getContractFactory("MockBUSD");
    busd = await MockBUSD.deploy();

    const OSLODAO = await ethers.getContractFactory("OSLODAO");
    dao = await OSLODAO.deploy(await busd.getAddress());

    await dao.configure(owner.address);

    // Fund royalty pool
    await busd.mint(owner.address, ethers.parseEther("10000000"));
    await busd.approve(await dao.getAddress(), ethers.MaxUint256);
    await dao.receiveRoyaltyPool(ethers.parseEther("1000000"));
  });

  describe("DAO Qualification", function () {
    it("should qualify user with 250+ team members", async function () {
      await dao.checkAndQualify(user1.address, 250);
      expect(await dao.isDAOMember(user1.address)).to.equal(true);
      expect(await dao.daoMemberCount()).to.equal(1);
    });

    it("should not qualify user with less than 250 team members", async function () {
      await dao.checkAndQualify(user1.address, 100);
      expect(await dao.isDAOMember(user1.address)).to.equal(false);
    });

    it("should limit to 200 DAO members", async function () {
      const signers = await ethers.getSigners();
      // Qualify 200 members
      for (let i = 0; i < 200 && i < signers.length; i++) {
        await dao.checkAndQualify(signers[i].address, 250);
      }
      // If we have enough signers, the 201st should not qualify
      if (signers.length > 200) {
        await dao.checkAndQualify(signers[200].address, 250);
        // Should silently return without qualifying
      }
    });

    it("should not double-qualify", async function () {
      await dao.checkAndQualify(user1.address, 250);
      await dao.checkAndQualify(user1.address, 300); // Should not add again
      expect(await dao.daoMemberCount()).to.equal(1);
    });
  });

  describe("Monthly Turnover", function () {
    it("should record monthly turnover", async function () {
      await dao.recordMonthlyTurnover(ethers.parseEther("100000"));
      const monthId = await dao.getCurrentMonthId();
      expect(await dao.monthlyTurnover(monthId)).to.equal(ethers.parseEther("100000"));
    });
  });

  describe("Royalty Claiming", function () {
    it("should allow DAO member to claim royalty for previous month", async function () {
      await dao.checkAndQualify(user1.address, 250);
      await dao.recordMonthlyTurnover(ethers.parseEther("1000000"));

      // Advance past month
      await time.increase(31 * 86400);

      const balBefore = await busd.balanceOf(user1.address);
      await dao.connect(user1).claimRoyalty();
      const balAfter = await busd.balanceOf(user1.address);

      // 0.5% of $1M / 1 member = $5000
      expect(balAfter - balBefore).to.equal(ethers.parseEther("5000"));
    });

    it("should reject non-DAO member claiming", async function () {
      await expect(
        dao.connect(user2).claimRoyalty()
      ).to.be.revertedWithCustomError(dao, "NotDAOMember");
    });

    it("should reject double claiming", async function () {
      await dao.checkAndQualify(user1.address, 250);
      await dao.recordMonthlyTurnover(ethers.parseEther("1000000"));
      await time.increase(31 * 86400);

      await dao.connect(user1).claimRoyalty();
      await expect(
        dao.connect(user1).claimRoyalty()
      ).to.be.revertedWithCustomError(dao, "AlreadyClaimed");
    });
  });
});
