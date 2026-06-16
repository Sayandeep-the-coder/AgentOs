const { ethers } = require("ethers");
require("dotenv").config();

const deployments = require("../deployments.json");
const CPE_ABI     = require("../artifacts/contracts/CPEContract.sol/ConditionalPaymentEscrow.json").abi;
const USDC_ABI    = ["function approve(address,uint256) returns(bool)",
                     "function balanceOf(address) view returns(uint256)"];

const provider = new ethers.JsonRpcProvider(process.env.FUJI_RPC_URL);
const wallet   = new ethers.Wallet(process.env.PERSONAL_AGENT_KEY, provider);
const cpe      = new ethers.Contract(deployments.cpe,  CPE_ABI,  wallet);
const usdc     = new ethers.Contract(deployments.usdc, USDC_ABI, wallet);

// Map condition type names to enum values
const CONDITION_TYPES = {
  FORMAT_JSON:      0,
  FIELD_EXISTS:     1,
  VALUE_THRESHOLD:  2
};

// ── createTask ───────────────────────────────────────────────────────
async function createTask({ condType, fieldName, threshold, amountUSDC, deadlineHours = 1 }) {
  const amountWei  = ethers.parseUnits(amountUSDC.toString(), 6);
  const deadline   = Math.floor(Date.now() / 1000) + (deadlineHours * 3600);
  const fieldBytes = ethers.encodeBytes32String(fieldName || "");

  // Check balance before attempting
  const balance = await usdc.balanceOf(wallet.address);
  if (balance < amountWei) {
    throw new Error(`Insufficient USDC. Have: ${ethers.formatUnits(balance, 6)}, need: ${amountUSDC}`);
  }

  console.log(`[PersonalAgent] Approving ${amountUSDC} USDC...`);
  const approveTx = await usdc.approve(deployments.cpe, amountWei);
  const approveReceipt = await approveTx.wait();
  console.log(`[PersonalAgent] Approve tx: https://testnet.snowtrace.io/tx/${approveTx.hash}`);

  console.log(`[PersonalAgent] Creating task (${condType}, threshold=${threshold})...`);
  const createTx = await cpe.createTask(
    amountWei,
    CONDITION_TYPES[condType],
    fieldBytes,
    threshold || 0,
    deadline
  );
  const createReceipt = await createTx.wait();

  // Extract taskId from TaskCreated event
  const event = createReceipt.logs
    .map(log => { try { return cpe.interface.parseLog(log); } catch { return null; } })
    .find(e => e?.name === "TaskCreated");

  const taskId = event.args.taskId;
  console.log(`[PersonalAgent] Task ${taskId} created ✓`);
  console.log(`[PersonalAgent] Lock tx: https://testnet.snowtrace.io/tx/${createTx.hash}`);

  return { taskId, txHash: createTx.hash };
}

// ── monitorTask ──────────────────────────────────────────────────────
async function monitorTask(taskId, intervalMs = 3000) {
  const STATUS = ["LOCKED", "PENDING_PROOF", "SETTLED_PASS", "SETTLED_FAIL"];
  return new Promise((resolve) => {
    const poll = setInterval(async () => {
      const task = await cpe.getTask(taskId);
      const status = STATUS[Number(task.status)];
      console.log(`[PersonalAgent] Task ${taskId}: ${status}`);
      if (Number(task.status) >= 2) {
        clearInterval(poll);
        resolve(task);
      }
    }, intervalMs);
  });
}

// ── listenForSettlement (event-based alternative) ────────────────────
async function listenForSettlement(taskId) {
  return new Promise((resolve) => {
    cpe.once(cpe.filters.TaskSettled(taskId), (id, passed, recipient, amount, event) => {
      console.log(`[PersonalAgent] Settled: ${passed ? "PASS ✅" : "FAIL ❌"}`);
      console.log(`[PersonalAgent] Settlement tx: https://testnet.snowtrace.io/tx/${event.log.transactionHash}`);
      resolve({ passed, recipient, amount });
    });
  });
}

module.exports = { createTask, monitorTask, listenForSettlement };
