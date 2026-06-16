const { ethers } = require("hardhat");
require("dotenv").config();
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`\nDeploying with: ${deployer.address}\n`);

  // ── USDC address on Fuji ───────────────────────────────────────
  const USDC_ADDRESS = process.env.USDC_FUJI || "0x5425890298aed601595a70AB815c96711a31Bc65";

  // ── Step 1: Deploy MockERC8004 ─────────────────────────────────
  console.log("Deploying MockERC8004...");
  const MockERC8004 = await ethers.getContractFactory("MockERC8004");
  const erc8004 = await MockERC8004.deploy();
  await erc8004.waitForDeployment();
  const erc8004Addr = await erc8004.getAddress();
  console.log(`MockERC8004: ${erc8004Addr}`);

  // ── Step 2: Deploy ConditionalPaymentEscrow ────────────────────
  console.log("Deploying ConditionalPaymentEscrow...");
  const CPE = await ethers.getContractFactory("ConditionalPaymentEscrow");
  const cpe = await CPE.deploy(USDC_ADDRESS, erc8004Addr);
  await cpe.waitForDeployment();
  const cpeAddr = await cpe.getAddress();
  console.log(`CPE: ${cpeAddr}`);

  // ── Step 3: Link CPE to ERC-8004 ──────────────────────────────
  console.log("Linking CPE to ERC8004...");
  const linkTx = await erc8004.setCPEContract(cpeAddr);
  await linkTx.wait();
  console.log("Linking CPE to ERC8004...  ✓");

  // ── Write deployments.json ─────────────────────────────────────
  const deployments = {
    erc8004: erc8004Addr,
    cpe:     cpeAddr,
    usdc:    USDC_ADDRESS,
    network: "fuji",
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
  };

  const deploymentsPath = path.join(__dirname, "..", "deployments.json");
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  console.log("deployments.json written.");

  // ── Summary ────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  MockERC8004:  ${erc8004Addr}`);
  console.log(`  CPE:          ${cpeAddr}`);
  console.log(`  USDC:         ${USDC_ADDRESS}`);
  console.log(`  Network:      Avalanche Fuji (43113)`);
  console.log("═══════════════════════════════════════════════════");
  console.log(`\n  Snowtrace ERC8004: https://testnet.snowtrace.io/address/${erc8004Addr}`);
  console.log(`  Snowtrace CPE:     https://testnet.snowtrace.io/address/${cpeAddr}`);
  console.log("\n  Next step: npx hardhat run scripts/seed.js --network fuji\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
