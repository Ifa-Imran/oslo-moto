import { expect } from "chai";
import { ethers } from "hardhat";
import { OSLOToken, MockBUSD } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("OSLOToken", function () {
  let osloToken: OSLOToken;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let liquidityManager: SignerWithAddress;

  const TOTAL_SUPPLY = ethers.parseEther("11100000");
  const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";

  beforeEach(async function () {
    [owner, user1, user2, liquidityManager] = await ethers.getSigners();
    const OSLOTokenFactory = await ethers.getContractFactory("OSLOToken");
    osloToken = (await OSLOTokenFactory.deploy()) as unknown as OSLOToken;
    await osloToken.waitForDeployment();
  });

  describe("Deployment", function () {
    it("should mint total supply to deployer", async function () {
      expect(await osloToken.totalSupply()).to.equal(TOTAL_SUPPLY);
      expect(await osloToken.balanceOf(owner.address)).to.equal(TOTAL_SUPPLY);
    });

    it("should have correct name and symbol", async function () {
      expect(await osloToken.name()).to.equal("OSLO Protocol");
      expect(await osloToken.symbol()).to.equal("OSLO");
    });

    it("should start with zero burned", async function () {
      expect(await osloToken.totalBurned()).to.equal(0);
    });

    it("should set deployer as admin", async function () {
      expect(await osloToken.admin()).to.equal(owner.address);
    });

    it("should not be setup complete", async function () {
      expect(await osloToken.setupComplete()).to.equal(false);
    });
  });

  describe("Standard Transfers (0% tax)", function () {
    it("should transfer without tax when no sell endpoints", async function () {
      const amount = ethers.parseEther("1000");
      await osloToken.transfer(user1.address, amount);
      expect(await osloToken.balanceOf(user1.address)).to.equal(amount);
    });

    it("should transfer full amount between non-sell addresses", async function () {
      const amount = ethers.parseEther("500");
      await osloToken.transfer(user1.address, ethers.parseEther("1000"));
      await osloToken.connect(user1).transfer(user2.address, amount);
      expect(await osloToken.balanceOf(user2.address)).to.equal(amount);
    });
  });

  describe("Sell Tax", function () {
    beforeEach(async function () {
      await osloToken.setSellTaxAddresses(liquidityManager.address);
      await osloToken.setSellEndpoint(user2.address, true); // user2 is a "sell endpoint" (e.g., LP pair)
      await osloToken.transfer(user1.address, ethers.parseEther("10000"));
    });

    it("should apply 10% sell tax when transferring to sell endpoint", async function () {
      const amount = ethers.parseEther("1000");
      await osloToken.connect(user1).transfer(user2.address, amount);

      // 10% tax = 100 OSLO
      // Net to user2 = 900
      const net = ethers.parseEther("900");
      expect(await osloToken.balanceOf(user2.address)).to.equal(net);
    });

    it("should send 90% of tax to LP and 10% to burn", async function () {
      const amount = ethers.parseEther("1000");
      const tax = ethers.parseEther("100"); // 10%
      const toLp = ethers.parseEther("90"); // 90% of tax
      const toBurn = ethers.parseEther("10"); // 10% of tax

      await osloToken.connect(user1).transfer(user2.address, amount);

      expect(await osloToken.balanceOf(liquidityManager.address)).to.equal(toLp);
      expect(await osloToken.balanceOf(DEAD_ADDRESS)).to.equal(toBurn);
      expect(await osloToken.totalBurned()).to.equal(toBurn);
    });

    it("should not apply tax for whitelisted sender", async function () {
      await osloToken.setTaxWhitelist(user1.address, true);
      const amount = ethers.parseEther("1000");
      await osloToken.connect(user1).transfer(user2.address, amount);
      expect(await osloToken.balanceOf(user2.address)).to.equal(amount);
    });

    it("should emit SellTaxApplied event", async function () {
      const amount = ethers.parseEther("1000");
      await expect(osloToken.connect(user1).transfer(user2.address, amount))
        .to.emit(osloToken, "SellTaxApplied");
    });
  });

  describe("Admin Functions", function () {
    it("should only allow admin to set sell tax addresses", async function () {
      await expect(
        osloToken.connect(user1).setSellTaxAddresses(user2.address)
      ).to.be.revertedWithCustomError(osloToken, "OnlyAdmin");
    });

    it("should revert on zero address for sell tax", async function () {
      await expect(
        osloToken.setSellTaxAddresses(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(osloToken, "ZeroAddress");
    });

    it("should complete setup and renounce admin", async function () {
      await osloToken.completeSetup();
      expect(await osloToken.setupComplete()).to.equal(true);
      expect(await osloToken.admin()).to.equal(ethers.ZeroAddress);
    });

    it("should not allow changes after setup complete", async function () {
      await osloToken.completeSetup();
      await expect(
        osloToken.setSellTaxAddresses(user1.address)
      ).to.be.revertedWithCustomError(osloToken, "OnlyAdmin");
    });
  });

  describe("No Minting", function () {
    it("should not have a mint function", async function () {
      // OSLOToken has no mint function — just verify supply is fixed
      expect(await osloToken.totalSupply()).to.equal(TOTAL_SUPPLY);
    });
  });
});
