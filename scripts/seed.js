const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const deployments = require("../deployments.json");
  const [deployer] = await ethers.getSigners();

  console.log(`\nSeeding agents with deployer: ${deployer.address}\n`);

  // ── Connect to MockERC8004 ─────────────────────────────────────
  const erc8004 = await ethers.getContractAt("MockERC8004", deployments.erc8004);

  // ── Capability ─────────────────────────────────────────────────
  const researchCap = ethers.encodeBytes32String("research");

  // ── Get agent addresses from env ──────────────────────────────
  const personalAgentWallet = new ethers.Wallet(process.env.PERSONAL_AGENT_KEY);
  const researchAgentWallet = new ethers.Wallet(process.env.RESEARCH_AGENT_KEY);

  const personalAddr = personalAgentWallet.address;
  const researchAddr = researchAgentWallet.address;

  // ── Register Personal Agent (score=87) ─────────────────────────
  console.log(`Registering Personal Agent: ${personalAddr} (score=87)...`);
  try {
    const tx1 = await erc8004.registerAgent(personalAddr, 87, [researchCap]);
    await tx1.wait();
    console.log(`Personal Agent registered: ${personalAddr} score=87 capability=research ✓`);
  } catch (err) {
    if (err.message.includes("Already registered")) {
      console.log(`Personal Agent already registered ✓`);
    } else {
      throw err;
    }
  }

  // ── Register Research Agent (score=42) ─────────────────────────
  console.log(`Registering Research Agent: ${researchAddr} (score=42)...`);
  try {
    const tx2 = await erc8004.registerAgent(researchAddr, 42, [researchCap]);
    await tx2.wait();
    console.log(`Research Agent registered: ${researchAddr} score=42 capability=research ✓`);
  } catch (err) {
    if (err.message.includes("Already registered")) {
      console.log(`Research Agent already registered ✓`);
    } else {
      throw err;
    }
  }

  // ── Verify ─────────────────────────────────────────────────────
  console.log("\n── Verification ──");
  const [pScore, pCaps, pReg] = await erc8004.getAgent(personalAddr);
  console.log(`Personal Agent: score=${pScore}, registered=${pReg}, caps=${pCaps.map(c => ethers.decodeBytes32String(c))}`);

  const [rScore, rCaps, rReg] = await erc8004.getAgent(researchAddr);
  console.log(`Research Agent: score=${rScore}, registered=${rReg}, caps=${rCaps.map(c => ethers.decodeBytes32String(c))}`);

  console.log("\n✅ Seeding complete. Ready to run demo.\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
