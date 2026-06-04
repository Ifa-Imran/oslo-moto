import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("OSLODexV2 & OSLOVault", function () {
    let deployer: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let rewardWallet: SignerWithAddress;
    let companyWallet: SignerWithAddress;
    let perfWallet: SignerWithAddress;

    let usdt: any;
    let osloToken: any;
    let osloDex: any;
    let osloVault: any;

    const INITIAL_USDT = ethers.parseEther("2000");
    const INITIAL_OSLO = ethers.parseEther("100000");
    const VAULT_OSLO = ethers.parseEther("10900000"); // 10.9M to vault (leave 100K for test distributions)
    const TEST_OSLO = ethers.parseEther("100000"); // 100K for test user distributions
    const LAUNCH_TIMESTAMP = Math.floor(Date.now() / 1000) - 86400; // 1 day ago

    beforeEach(async function () {
        [deployer, user1, user2, rewardWallet, companyWallet, perfWallet] = await ethers.getSigners();

        // Deploy MockUSDT
        const MockUSDTFactory = await ethers.getContractFactory("MockUSDT");
        usdt = await MockUSDTFactory.deploy();
        await usdt.waitForDeployment();

        // Deploy OSLOTokenV2
        const TokenFactory = await ethers.getContractFactory("OSLOTokenV2");
        osloToken = await TokenFactory.deploy();
        await osloToken.waitForDeployment();

        // Deploy OSLODexV2
        const DexFactory = await ethers.getContractFactory("OSLODexV2");
        osloDex = await DexFactory.deploy(await usdt.getAddress(), await osloToken.getAddress());
        await osloDex.waitForDeployment();

        // Deploy OSLOVault
        const VaultFactory = await ethers.getContractFactory("OSLOVault");
        osloVault = await VaultFactory.deploy(await usdt.getAddress(), await osloToken.getAddress(), LAUNCH_TIMESTAMP);
        await osloVault.waitForDeployment();

        // Configure DEX: set vault
        await osloDex.configure(await osloVault.getAddress(), deployer.address);

        // Configure Vault: set dex
        await osloVault.configure(
            await osloDex.getAddress(),
            ethers.ZeroAddress, // no referral for basic tests
            ethers.ZeroAddress, // no rank system for basic tests
            deployer.address    // timelock = deployer
        );

        // Set reward wallets
        await osloVault.setRewardWallets(
            rewardWallet.address,
            companyWallet.address,
            perfWallet.address
        );

        // Transfer OSLO to Vault (10.9M) — keep 100K for test distributions
        await osloToken.transfer(await osloVault.getAddress(), VAULT_OSLO);
        // Deployer keeps TEST_OSLO (100K) for distributing to test users

        // Add initial liquidity (2000 USDT + 100K OSLO)
        await usdt.mint(deployer.address, INITIAL_USDT);
        await usdt.approve(await osloDex.getAddress(), INITIAL_USDT);
        await osloToken.approve(await osloDex.getAddress(), INITIAL_OSLO);
        await osloDex.addInitialLiquidity(INITIAL_USDT, INITIAL_OSLO);

        // Mint USDT to users for deposits
        await usdt.mint(user1.address, ethers.parseEther("10000"));
        await usdt.mint(user2.address, ethers.parseEther("10000"));
    });

    describe("Initial Setup", function () {
        it("should have correct initial price ($0.02)", async function () {
            const price = await osloDex.getPrice();
            // 2000 USDT / 100000 OSLO = 0.02 USDT/OSLO
            expect(price).to.equal(ethers.parseEther("0.02"));
        });

        it("should have correct reserves", async function () {
            const [usdtRes, osloRes] = await osloDex.getReserves();
            expect(usdtRes).to.equal(INITIAL_USDT);
            expect(osloRes).to.equal(INITIAL_OSLO);
        });

        it("vault should hold 11M OSLO", async function () {
            const vaultBalance = await osloToken.balanceOf(await osloVault.getAddress());
            expect(vaultBalance).to.equal(VAULT_OSLO);
        });
    });

    describe("Sell-Only Restriction", function () {
        it("should revert when non-vault tries to processBuy", async function () {
            await usdt.mint(user1.address, ethers.parseEther("100"));
            await usdt.connect(user1).approve(await osloDex.getAddress(), ethers.parseEther("100"));
            await expect(
                osloDex.connect(user1).processBuy(ethers.parseEther("100"))
            ).to.be.revertedWithCustomError(osloDex, "OnlyVault");
        });

        it("should allow anyone to sell OSLO", async function () {
            // Give user1 some OSLO first (simulate receiving from vault rewards)
            await osloToken.transfer(user1.address, ethers.parseEther("1000"));
            await osloToken.connect(user1).approve(await osloDex.getAddress(), ethers.parseEther("1000"));

            const usdtBefore = await usdt.balanceOf(user1.address);
            await osloDex.connect(user1).sellOSLO(ethers.parseEther("1000"), 0);
            const usdtAfter = await usdt.balanceOf(user1.address);

            expect(usdtAfter).to.be.gt(usdtBefore);
        });
    });

    describe("Sell Mechanics", function () {
        it("should apply 10% USD tax on sells", async function () {
            // Give user1 OSLO
            await osloToken.transfer(user1.address, ethers.parseEther("1000"));
            await osloToken.connect(user1).approve(await osloDex.getAddress(), ethers.parseEther("1000"));

            // Get quote (which includes tax)
            const quotedOut = await osloDex.getUSDTForOSLO(ethers.parseEther("1000"));

            // Execute sell
            const usdtBefore = await usdt.balanceOf(user1.address);
            await osloDex.connect(user1).sellOSLO(ethers.parseEther("1000"), 0);
            const usdtAfter = await usdt.balanceOf(user1.address);
            const received = usdtAfter - usdtBefore;

            // Should match quote
            expect(received).to.equal(quotedOut);

            // Should be ~90% of raw AMM output
            // Raw: 1000 * 2000 / (100000 + 1000) = 19.80...
            // After 10% tax: ~17.82
            expect(received).to.be.gt(ethers.parseEther("17"));
            expect(received).to.be.lt(ethers.parseEther("18"));
        });

        it("should burn 50% and add 50% to liquidity", async function () {
            await osloToken.transfer(user1.address, ethers.parseEther("1000"));
            await osloToken.connect(user1).approve(await osloDex.getAddress(), ethers.parseEther("1000"));

            const [, osloBefore] = await osloDex.getReserves();
            const deadBefore = await osloToken.balanceOf("0x000000000000000000000000000000000000dEaD");

            await osloDex.connect(user1).sellOSLO(ethers.parseEther("1000"), 0);

            const [, osloAfter] = await osloDex.getReserves();
            const deadAfter = await osloToken.balanceOf("0x000000000000000000000000000000000000dEaD");

            // 500 burned (to dead address)
            expect(deadAfter - deadBefore).to.equal(ethers.parseEther("500"));

            // 500 added to OSLO reserve
            expect(osloAfter - osloBefore).to.equal(ethers.parseEther("500"));
        });

        it("should enforce slippage protection", async function () {
            await osloToken.transfer(user1.address, ethers.parseEther("1000"));
            await osloToken.connect(user1).approve(await osloDex.getAddress(), ethers.parseEther("1000"));

            await expect(
                osloDex.connect(user1).sellOSLO(ethers.parseEther("1000"), ethers.parseEther("1000"))
            ).to.be.revertedWithCustomError(osloDex, "SlippageExceeded");
        });
    });

    describe("Deposit Flow", function () {
        it("should accept USDT deposit and update user balance", async function () {
            const depositAmount = ethers.parseEther("100");
            await usdt.connect(user1).approve(await osloVault.getAddress(), depositAmount);

            await osloVault.connect(user1).deposit(depositAmount);

            const activeDeposit = await osloVault.getActiveDeposit(user1.address);
            expect(activeDeposit).to.equal(depositAmount);
        });

        it("should split 2% fee to reward wallets", async function () {
            const depositAmount = ethers.parseEther("1000");
            await usdt.connect(user1).approve(await osloVault.getAddress(), depositAmount);

            const rewardBefore = await usdt.balanceOf(rewardWallet.address);
            const companyBefore = await usdt.balanceOf(companyWallet.address);
            const perfBefore = await usdt.balanceOf(perfWallet.address);

            await osloVault.connect(user1).deposit(depositAmount);

            // 1% = $10, 0.5% = $5, 0.5% = $5
            expect(await usdt.balanceOf(rewardWallet.address) - rewardBefore).to.equal(ethers.parseEther("10"));
            expect(await usdt.balanceOf(companyWallet.address) - companyBefore).to.equal(ethers.parseEther("5"));
            expect(await usdt.balanceOf(perfWallet.address) - perfBefore).to.equal(ethers.parseEther("5"));
        });

        it("should increase DEX USDT reserve (liquidity added)", async function () {
            const depositAmount = ethers.parseEther("100");
            await usdt.connect(user1).approve(await osloVault.getAddress(), depositAmount);

            const [usdtBefore] = await osloDex.getReserves();
            await osloVault.connect(user1).deposit(depositAmount);
            const [usdtAfter] = await osloDex.getReserves();

            // 98% of deposit goes to DEX (2% fee)
            expect(usdtAfter - usdtBefore).to.equal(ethers.parseEther("98"));
        });

        it("should increase OSLO price after deposit", async function () {
            const priceBefore = await osloDex.getPrice();

            const depositAmount = ethers.parseEther("1000");
            await usdt.connect(user1).approve(await osloVault.getAddress(), depositAmount);
            await osloVault.connect(user1).deposit(depositAmount);

            const priceAfter = await osloDex.getPrice();
            expect(priceAfter).to.be.gt(priceBefore);
        });

        it("should reject deposits above max per tx ($5000)", async function () {
            const tooMuch = ethers.parseEther("5001");
            await usdt.connect(user1).approve(await osloVault.getAddress(), tooMuch);
            await expect(
                osloVault.connect(user1).deposit(tooMuch)
            ).to.be.revertedWithCustomError(osloVault, "DepositTooHigh");
        });
    });

    describe("Yield Claims", function () {
        it("should accumulate yield over time and pay in OSLO", async function () {
            const depositAmount = ethers.parseEther("1000");
            await usdt.connect(user1).approve(await osloVault.getAddress(), depositAmount);
            await osloVault.connect(user1).deposit(depositAmount);

            // Fast forward 1 day
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine", []);

            const pending = await osloVault.getPendingRewards(user1.address);
            expect(pending).to.be.gt(0);

            // Claim rewards
            const osloBefore = await osloToken.balanceOf(user1.address);
            await osloVault.connect(user1).claimRewards();
            const osloAfter = await osloToken.balanceOf(user1.address);

            expect(osloAfter).to.be.gt(osloBefore);
        });

        it("should respect 3X cap", async function () {
            const depositAmount = ethers.parseEther("100");
            await usdt.connect(user1).approve(await osloVault.getAddress(), depositAmount);
            await osloVault.connect(user1).deposit(depositAmount);

            // Fast forward enough to exceed 3X at 0.45% daily
            // 3X = $300 on $100. At 0.45%/day = $0.45/day. Need 667+ days.
            await ethers.provider.send("evm_increaseTime", [86400 * 700]);
            await ethers.provider.send("evm_mine", []);

            const pending = await osloVault.getPendingRewards(user1.address);
            // Max should be capped at 3X = $300
            expect(pending).to.equal(ethers.parseEther("300"));
        });
    });

    describe("Early Exit", function () {
        it("should allow full exit within 10-day window", async function () {
            const depositAmount = ethers.parseEther("100");
            await usdt.connect(user1).approve(await osloVault.getAddress(), depositAmount);
            await osloVault.connect(user1).deposit(depositAmount);

            // Exit immediately (within 10-day window)
            const usdtBefore = await usdt.balanceOf(user1.address);
            await osloVault.connect(user1).earlyExit();
            const usdtAfter = await usdt.balanceOf(user1.address);

            // Should get back ~90% (10% fee)
            const received = usdtAfter - usdtBefore;
            expect(received).to.be.gt(0);
        });

        it("should revert after 10-day window", async function () {
            const depositAmount = ethers.parseEther("100");
            await usdt.connect(user1).approve(await osloVault.getAddress(), depositAmount);
            await osloVault.connect(user1).deposit(depositAmount);

            // Fast forward 11 days
            await ethers.provider.send("evm_increaseTime", [86400 * 11]);
            await ethers.provider.send("evm_mine", []);

            await expect(
                osloVault.connect(user1).earlyExit()
            ).to.be.revertedWithCustomError(osloVault, "NotInEarlyExitPeriod");
        });
    });

    describe("Consolidated Pool", function () {
        it("should merge multiple deposits into single pool", async function () {
            // First deposit
            await usdt.connect(user1).approve(await osloVault.getAddress(), ethers.parseEther("5000"));
            await osloVault.connect(user1).deposit(ethers.parseEther("100"));
            expect(await osloVault.getActiveDeposit(user1.address)).to.equal(ethers.parseEther("100"));

            // Second deposit — should merge
            await osloVault.connect(user1).deposit(ethers.parseEther("200"));
            expect(await osloVault.getActiveDeposit(user1.address)).to.equal(ethers.parseEther("300"));

            // Third deposit — should merge
            await osloVault.connect(user1).deposit(ethers.parseEther("500"));
            expect(await osloVault.getActiveDeposit(user1.address)).to.equal(ethers.parseEther("800"));
        });

        it("should tier up when total exceeds $2500", async function () {
            await usdt.connect(user1).approve(await osloVault.getAddress(), ethers.parseEther("5000"));

            await osloVault.connect(user1).deposit(ethers.parseEther("1000"));
            expect(await osloVault.getUserTier(user1.address)).to.equal(1); // Below $2500

            await osloVault.connect(user1).deposit(ethers.parseEther("2000"));
            expect(await osloVault.getUserTier(user1.address)).to.equal(2); // Now $3000 total
        });

        it("should checkpoint yield on new deposit", async function () {
            await usdt.connect(user1).approve(await osloVault.getAddress(), ethers.parseEther("5000"));
            await osloVault.connect(user1).deposit(ethers.parseEther("1000"));

            // Fast forward 1 day to accumulate yield
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine", []);

            // Get pending before second deposit
            const pendingBefore = await osloVault.getPendingRewards(user1.address);
            expect(pendingBefore).to.be.gt(0);

            // Second deposit should checkpoint yield
            await osloVault.connect(user1).deposit(ethers.parseEther("1000"));

            // Pending should still include the checkpointed amount
            const pendingAfter = await osloVault.getPendingRewards(user1.address);
            expect(pendingAfter).to.be.gte(pendingBefore);
        });
    });

    describe("Price Impact", function () {
        it("deposits increase price, sells decrease price", async function () {
            // Record initial price
            const priceInitial = await osloDex.getPrice();

            // Deposit: price goes up
            const depositAmount = ethers.parseEther("1000");
            await usdt.connect(user1).approve(await osloVault.getAddress(), depositAmount);
            await osloVault.connect(user1).deposit(depositAmount);
            const priceAfterDeposit = await osloDex.getPrice();
            expect(priceAfterDeposit).to.be.gt(priceInitial);

            // Give user2 OSLO and sell: price goes down
            await osloToken.transfer(user2.address, ethers.parseEther("5000"));
            await osloToken.connect(user2).approve(await osloDex.getAddress(), ethers.parseEther("5000"));
            await osloDex.connect(user2).sellOSLO(ethers.parseEther("5000"), 0);
            const priceAfterSell = await osloDex.getPrice();
            expect(priceAfterSell).to.be.lt(priceAfterDeposit);
        });
    });
});
