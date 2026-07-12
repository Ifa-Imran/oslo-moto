import { ethers } from "hardhat";

/**
 * Add OSLO/USDT Liquidity Pool on PancakeSwap V2
 *
 * PancakeSwap V2 Router: 0x10ED43C718714eb63d5aA57B78B54704E256024E
 * Factory (V2):           0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73
 *
 * Prerequisites:
 *   - Deployer wallet must hold OSLO tokens
 *   - Deployer wallet must hold USDT (real BSC USDT: 0x55d398326f99059fF775485246999027B3197955)
 *   - Both tokens must be approved to the PancakeSwap router
 *
 * Usage:
 *   npx hardhat run scripts/deploy/pancakeswap-add-liquidity.ts --network bscMainnet
 *
 * To customize amounts, edit OSLO_AMOUNT and USDT_AMOUNT below.
 */

const OSLO_TOKEN = "0xCAACC067BD389597BD95A762436Feb723616Cab3";
const USDT_TOKEN = "0x55d398326f99059fF775485246999027B3197955";
const PANCAKE_ROUTER_V2 = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const PANCAKE_FACTORY_V2 = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";

// Liquidity: 50 USDT + 7.142857 OSLO (sets initial price at $7/OSLO)
// price = usdtReserve / osloReserve = 50 / 7.142857 = 7
const OSLO_AMOUNT = "7.142857142857142857";  // ~7.14 OSLO (50 / 7)
const USDT_AMOUNT = "50";                     // 50 USDT

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

const ROUTER_ABI = [
  "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])",
];

const FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) view returns (address)",
  "function createPair(address tokenA, address tokenB) returns (address)",
];

const PAIR_ABI = [
  "function getReserves() view returns (uint112, uint112, uint32)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];

const VAULT_ADDR = "0x3A49898f23e610894F13F3D65484f557E627557f";
const VAULT_ABI = [
  "function releaseOSLO(address to, uint256 amount) external",
  "function osloBalance() view returns (uint256)",
  "function grantRole(bytes32 role, address account) external",
  "function hasRole(bytes32, address) view returns (bool)",
];

const ENGINE_ROLE_HASH = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(70));
  console.log("PANCAKESWAP V2 — ADD OSLO/USDT LIQUIDITY");
  console.log("=".repeat(70));
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Network:   BSC Mainnet (Chain ID 56)`);
  console.log(`Time:      ${new Date().toISOString()}`);

  const oslo = new ethers.Contract(OSLO_TOKEN, ERC20_ABI, deployer);
  const usdt = new ethers.Contract(USDT_TOKEN, ERC20_ABI, deployer);
  const router = new ethers.Contract(PANCAKE_ROUTER_V2, ROUTER_ABI, deployer);
  const factory = new ethers.Contract(PANCAKE_FACTORY_V2, FACTORY_ABI, deployer);
  const vault = new ethers.Contract(VAULT_ADDR, VAULT_ABI, deployer);

  // ---- 1. Verify tokens ----
  console.log("\n--- 1. TOKEN VERIFICATION ---");
  const osloName = await oslo.name();
  const osloSymbol = await oslo.symbol();
  const osloDecimals = await oslo.decimals();
  const usdtSymbol = await usdt.symbol();
  const usdtDecimals = await usdt.decimals();

  console.log(`  OSLO:  ${osloName} (${osloSymbol}), ${osloDecimals} decimals`);
  console.log(`  USDT:  ${usdtSymbol}, ${usdtDecimals} decimals`);
  console.log(`  OSLO Address:  ${OSLO_TOKEN}`);
  console.log(`  USDT Address:  ${USDT_TOKEN}`);

  // ---- 2. Check balances & fund from vault if needed ----
  console.log("\n--- 2. BALANCE CHECK & FUNDING ---");
  const osloAmount = ethers.parseUnits(OSLO_AMOUNT, osloDecimals);
  const usdtAmount = ethers.parseUnits(USDT_AMOUNT, usdtDecimals);

  let osloBalance = await oslo.balanceOf(deployer.address);
  let usdtBalance = await usdt.balanceOf(deployer.address);
  console.log(`  OSLO Balance:   ${ethers.formatUnits(osloBalance, osloDecimals)} ${osloSymbol}`);
  console.log(`  USDT Balance:   ${ethers.formatUnits(usdtBalance, usdtDecimals)} USDT`);
  console.log(`  OSLO to LP:     ${OSLO_AMOUNT} ${osloSymbol}`);
  console.log(`  USDT to LP:     ${USDT_AMOUNT} USDT`);

  // Release OSLO from vault if needed
  if (osloBalance < osloAmount) {
    const needed = osloAmount - osloBalance;
    console.log(`\n  Releasing OSLO from RewardVault...`);
    console.log(`  Need: ${ethers.formatUnits(needed, osloDecimals)} OSLO`);

    // Grant ENGINE_ROLE to deployer if not already
    const hasEngineRole = await vault.hasRole(ENGINE_ROLE_HASH, deployer.address);
    if (!hasEngineRole) {
      console.log("  Granting ENGINE_ROLE to deployer on vault...");
      const grantTx = await vault.grantRole(ENGINE_ROLE_HASH, deployer.address);
      await grantTx.wait();
      console.log("  ✅ ENGINE_ROLE granted");
    }

    // Release OSLO
    const vaultBal = await vault.osloBalance();
    console.log(`  Vault OSLO balance: ${ethers.formatUnits(vaultBal, osloDecimals)}`);
    const releaseTx = await vault.releaseOSLO(deployer.address, needed);
    console.log(`  Tx: ${releaseTx.hash}`);
    await releaseTx.wait();
    console.log(`  ✅ Released ${ethers.formatUnits(needed, osloDecimals)} OSLO to deployer`);

    osloBalance = await oslo.balanceOf(deployer.address);
    console.log(`  Deployer OSLO balance now: ${ethers.formatUnits(osloBalance, osloDecimals)}`);
  }

  if (usdtBalance < usdtAmount) {
    console.log(`\n  ❌ Insufficient USDT! Need ${USDT_AMOUNT}, have ${ethers.formatUnits(usdtBalance, usdtDecimals)}`);
    console.log(`  Please send ${USDT_AMOUNT} USDT to ${deployer.address} and re-run.`);
    console.log(`  BSC USDT address: ${USDT_TOKEN}`);
    return;
  }
  console.log(`  ✅ Sufficient balances`);

  // ---- 3. Check existing pair ----
  console.log("\n--- 3. CHECK EXISTING PAIR ---");
  let pairAddress = await factory.getPair(OSLO_TOKEN, USDT_TOKEN);
  if (pairAddress === ethers.ZeroAddress) {
    console.log(`  No existing pair found. Will be created automatically by addLiquidity.`);
  } else {
    console.log(`  Existing pair found: ${pairAddress}`);
    const pair = new ethers.Contract(pairAddress, PAIR_ABI, deployer);
    const [reserve0, reserve1] = await pair.getReserves();
    const token0 = await pair.token0();
    const isOsloToken0 = token0.toLowerCase() === OSLO_TOKEN.toLowerCase();
    const osloReserve = isOsloToken0 ? reserve0 : reserve1;
    const usdtReserve = isOsloToken0 ? reserve1 : reserve0;
    console.log(`  Existing reserves:`);
    console.log(`    OSLO:  ${ethers.formatUnits(osloReserve, osloDecimals)}`);
    console.log(`    USDT:  ${ethers.formatUnits(usdtReserve, usdtDecimals)}`);
    if (osloReserve > 0n && usdtReserve > 0n) {
      const price = Number(usdtReserve) / Number(osloReserve);
      console.log(`    Price: $${price.toFixed(6)} per OSLO`);
    }
  }

  // ---- 4. Approve tokens ----
  console.log("\n--- 4. APPROVE TOKENS ---");

  // Check OSLO allowance
  const osloAllowance = await oslo.allowance(deployer.address, PANCAKE_ROUTER_V2);
  if (osloAllowance < osloAmount) {
    console.log(`  Approving ${OSLO_AMOUNT} OSLO to PancakeSwap Router...`);
    const approveTx = await oslo.approve(PANCAKE_ROUTER_V2, ethers.MaxUint256);
    console.log(`  Tx: ${approveTx.hash}`);
    await approveTx.wait();
    console.log(`  ✅ OSLO approved (infinite)`);
  } else {
    console.log(`  ✅ OSLO already approved`);
  }

  // Check USDT allowance
  const usdtAllowance = await usdt.allowance(deployer.address, PANCAKE_ROUTER_V2);
  if (usdtAllowance < usdtAmount) {
    console.log(`  Approving ${USDT_AMOUNT} USDT to PancakeSwap Router...`);
    const approveTx = await usdt.approve(PANCAKE_ROUTER_V2, ethers.MaxUint256);
    console.log(`  Tx: ${approveTx.hash}`);
    await approveTx.wait();
    console.log(`  ✅ USDT approved (infinite)`);
  } else {
    console.log(`  ✅ USDT already approved`);
  }

  // ---- 5. Add liquidity ----
  console.log("\n--- 5. ADD LIQUIDITY ---");
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes

  // Slippage tolerance: 1% (adjust if needed)
  const osloMin = (osloAmount * 99n) / 100n;
  const usdtMin = (usdtAmount * 99n) / 100n;

  console.log(`  Token A:         ${OSLO_TOKEN} (OSLO)`);
  console.log(`  Token B:         ${USDT_TOKEN} (USDT)`);
  console.log(`  Amount A Desired:${OSLO_AMOUNT} OSLO`);
  console.log(`  Amount B Desired:${USDT_AMOUNT} USDT`);
  console.log(`  Amount A Min:    ${ethers.formatUnits(osloMin, osloDecimals)} OSLO (1% slippage)`);
  console.log(`  Amount B Min:    ${ethers.formatUnits(usdtMin, usdtDecimals)} USDT (1% slippage)`);
  console.log(`  To:              ${deployer.address}`);
  console.log(`  Deadline:        ${new Date(deadline * 1000).toISOString()}`);

  console.log(`\n  Sending tx: router.addLiquidity(...)`);
  const tx = await router.addLiquidity(
    OSLO_TOKEN,
    USDT_TOKEN,
    osloAmount,
    usdtAmount,
    osloMin,
    usdtMin,
    deployer.address,
    deadline
  );
  console.log(`  Tx hash: ${tx.hash}`);
  console.log(`  Waiting for confirmation...`);
  const receipt = await tx.wait();
  console.log(`  ✅ Confirmed in block ${receipt?.blockNumber} (gas: ${receipt?.gasUsed})`);

  // ---- 6. Verify LP creation ----
  console.log("\n--- 6. VERIFY LP ---");
  pairAddress = await factory.getPair(OSLO_TOKEN, USDT_TOKEN);
  console.log(`  Pair Address:    ${pairAddress}`);
  console.log(`  View on BscScan: https://bscscan.com/address/${pairAddress}`);

  const pair = new ethers.Contract(pairAddress, PAIR_ABI, deployer);
  const [reserve0, reserve1] = await pair.getReserves();
  const token0 = await pair.token0();
  const isOsloToken0 = token0.toLowerCase() === OSLO_TOKEN.toLowerCase();
  const osloReserve = isOsloToken0 ? reserve0 : reserve1;
  const usdtReserve = isOsloToken0 ? reserve1 : reserve0;
  const lpTotalSupply = await pair.totalSupply();
  const lpBalance = await pair.balanceOf(deployer.address);

  console.log(`\n  Pool Reserves:`);
  console.log(`    OSLO:  ${ethers.formatUnits(osloReserve, osloDecimals)}`);
  console.log(`    USDT:  ${ethers.formatUnits(usdtReserve, usdtDecimals)}`);
  const price = Number(usdtReserve) / Number(osloReserve);
  console.log(`    Price: $${price.toFixed(6)} per OSLO`);
  console.log(`\n  LP Tokens:`);
  console.log(`    Total Supply:   ${ethers.formatUnits(lpTotalSupply, 18)}`);
  console.log(`    Your Balance:   ${ethers.formatUnits(lpBalance, 18)}`);

  // ---- 7. Summary ----
  console.log("\n" + "=".repeat(70));
  console.log("✅ PANCAKESWAP LP CREATED SUCCESSFULLY!");
  console.log("=".repeat(70));
  console.log(`  Pair:    ${pairAddress}`);
  console.log(`  Price:   $${price.toFixed(6)} / OSLO`);
  console.log(`  LP:      ${ethers.formatUnits(lpBalance, 18)} (held by deployer)`);
  console.log("\n  NEXT STEPS:");
  console.log("  1. Verify pair on BscScan (link above)");
  console.log("  2. Users can now swap OSLO on PancakeSwap");
  console.log("  3. Consider locking LP tokens (see script comments)");
  console.log("  4. Add token info on BscScan (Update Token Info)");
  console.log("  5. Apply for PancakeSwap default list (optional)");
  console.log("=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
