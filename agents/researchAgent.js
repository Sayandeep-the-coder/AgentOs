const { ethers } = require("ethers");
require("dotenv").config();

const deployments = require("../deployments.json");
const CPE_ABI     = require("../artifacts/contracts/CPEContract.sol/ConditionalPaymentEscrow.json").abi;
const ERC8004_ABI = require("../artifacts/contracts/MockERC8004.sol/MockERC8004.json").abi;

const provider = new ethers.JsonRpcProvider(process.env.FUJI_RPC_URL);
const wallet   = new ethers.Wallet(process.env.RESEARCH_AGENT_KEY, provider);
const cpe      = new ethers.Contract(deployments.cpe,     CPE_ABI,     wallet);
const erc8004  = new ethers.Contract(deployments.erc8004, ERC8004_ABI, wallet);

// ── discoverTasks ────────────────────────────────────────────────────
async function discoverTasks() {
  const openIds = await cpe.getOpenTasks();
  console.log(`[ResearchAgent] Open tasks: [${openIds.join(", ")}]`);
  return openIds;
}

// ── checkIdentity ────────────────────────────────────────────────────
async function checkIdentity() {
  const [score, caps, registered] = await erc8004.getAgent(wallet.address);
  console.log(`[ResearchAgent] ERC-8004: score=${score}, registered=${registered}`);
  return { score: Number(score), registered };
}

// ── acceptTask ───────────────────────────────────────────────────────
async function acceptTask(taskId) {
  const { registered } = await checkIdentity();
  if (!registered) throw new Error("Agent not registered in ERC-8004. Run scripts/seed.js");

  console.log(`[ResearchAgent] Accepting task ${taskId}...`);
  const tx = await cpe.acceptTask(taskId);
  await tx.wait();
  console.log(`[ResearchAgent] Accept tx: https://testnet.snowtrace.io/tx/${tx.hash}`);
  return tx.hash;
}

// ── buildProofData ───────────────────────────────────────────────────
function buildProofData(conditionType, output) {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();

  if (conditionType === 0) {
    // FORMAT_JSON — pass raw JSON bytes; contract checks { ... } boundaries
    const outputStr = typeof output === "string" ? output : JSON.stringify(output);
    return ethers.toUtf8Bytes(outputStr);
  }

  if (conditionType === 1) {
    // FIELD_EXISTS — agent attests to field presence
    const task = output._task; // caller must attach the task to output
    const fieldName = ethers.decodeBytes32String(task.condition.fieldName);
    const fieldExists = output.hasOwnProperty(fieldName);
    console.log(`[ResearchAgent] Field "${fieldName}" exists: ${fieldExists}`);
    return abiCoder.encode(["bool"], [fieldExists]);
  }

  if (conditionType === 2) {
    // VALUE_THRESHOLD — encode array length
    const fieldKeys = Object.keys(output).filter(k => Array.isArray(output[k]));
    const count = fieldKeys.length > 0 ? output[fieldKeys[0]].length : 0;
    console.log(`[ResearchAgent] Array count: ${count}`);
    return abiCoder.encode(["uint256"], [count]);
  }

  throw new Error(`Unknown conditionType: ${conditionType}`);
}

// ── submitDelivery ───────────────────────────────────────────────────
async function submitDelivery(taskId, output) {
  const task           = await cpe.getTask(taskId);
  const conditionType  = Number(task.condition.conditionType);

  // Attach task context to output for FIELD_EXISTS proof building
  if (conditionType === 1) output._task = task;

  const outputStr  = typeof output === "string" ? output : JSON.stringify(output);
  const outputHash = ethers.keccak256(ethers.toUtf8Bytes(outputStr));
  const resultUri  = `data:application/json,${encodeURIComponent(outputStr)}`;
  const proofData  = buildProofData(conditionType, output);

  console.log(`[ResearchAgent] Submitting delivery for task ${taskId}...`);
  const tx      = await cpe.submitDelivery(taskId, outputHash, resultUri, proofData);
  const receipt = await tx.wait();

  // Parse settlement outcome from event
  const settledEvent = receipt.logs
    .map(log => { try { return cpe.interface.parseLog(log); } catch { return null; } })
    .find(e => e?.name === "TaskSettled");

  const passed = settledEvent.args.passed;
  console.log(`[ResearchAgent] Settlement: ${passed ? "PASS ✅" : "FAIL ❌"}`);
  console.log(`[ResearchAgent] Settlement tx: https://testnet.snowtrace.io/tx/${tx.hash}`);

  return { passed, txHash: tx.hash };
}

module.exports = { discoverTasks, checkIdentity, acceptTask, buildProofData, submitDelivery };
