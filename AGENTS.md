# AgentOS — Agent Protocol

## Overview

AgentOS defines two agent roles: the **Personal Agent** (task creator, payer) and the **Research Agent** (task executor, payee). Both roles interact exclusively with the CPE smart contract. There is no off-chain message passing between agents, no central coordinator, and no human approval steps.

This document covers the task lifecycle, each agent's responsibilities, proof encoding, and ERC-8004 registration.

---

## Agent Roles

| Property | Personal Agent | Research Agent |
|---|---|---|
| Role | Task creator + payer | Task executor + payee |
| Holds | USDC budget | Specialist capability |
| Key action | `createTask()` | `submitDelivery()` |
| ERC-8004 required | No | Yes (for `acceptTask()`) |
| Demo trust score | 87/100 | 87/100 (Path A) · 42/100 (Path B) |
| Signs txs via | MetaMask (demo) | Hardhat private key (headless) |

---

## Task Lifecycle

```
PHASE 1 — TASK CREATION
Personal Agent
  1. Decides on task and verifiable output condition
  2. Calls USDC.approve(cpeAddress, amount)
  3. Calls CPE.createTask(amount, condType, fieldName, threshold, deadline)
  4. USDC locked in CPE contract
  5. Task status: LOCKED

PHASE 2 — TASK DISCOVERY
Research Agent
  1. Calls CPE.getOpenTasks() → [taskId, ...]
  2. Calls CPE.getTask(taskId) → reads condition + amount
  3. Calls ERC8004.getAgent(self) → checks own capability + trust score
  4. Calls CPE.acceptTask(taskId) — ERC-8004 gated
  5. Task status: PENDING_PROOF

PHASE 3 — EXECUTION + DELIVERY
Research Agent
  1. Executes the task (fetch data, query, compute)
  2. Builds output JSON
  3. Encodes proofData matching the condition type
  4. Computes outputHash = keccak256(JSON.stringify(output))
  5. Calls CPE.submitDelivery(taskId, outputHash, resultUri, proofData)

PHASE 4 — ON-CHAIN EVALUATION (atomic)
CPE Contract
  1. Runs _evaluateCondition(condition, proofData) → bool passed
  2. Runs _settle(taskId, passed):
     PASS → transfers USDC to Research Agent
     FAIL → returns USDC to Personal Agent
  3. Calls ERC8004.updateReputation(researchAgent, passed)
  4. Task status: SETTLED_PASS or SETTLED_FAIL

PHASE 5 — COMPLETION (no action needed)
Both agents
  - Personal Agent sees final status via getTask() or TaskSettled event
  - Research Agent receives USDC (if passed) or nothing (if failed)
  - ERC-8004 score updated permanently
```

---

## Personal Agent

### personalAgent.js — Full Reference

```javascript
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
```

### Key Design Decisions

**Why approve then createTask separately?**
ERC-20 requires a two-step flow: `approve(spender, amount)` then the spender calls `transferFrom`. `createTask()` calls `usdc.safeTransferFrom(msg.sender, address(this), amount)`. Both steps must be in separate transactions.

**Why MetaMask for the Personal Agent in the demo?**
It makes the "condition setup" step visual and human-legible. The user (judge) can see exactly what condition is being set before USDC is locked. After that single interaction, no further human input is needed.

---

## Research Agent

### researchAgent.js — Full Reference

```javascript
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
    // Assumes the relevant field is yield_opportunities or similar
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
```

---

## Proof Data Encoding — Full Reference

The `proofData` parameter in `submitDelivery()` must be encoded differently for each condition type. Getting this wrong causes the condition to fail even on a valid output.

### FORMAT_JSON

The contract checks that the first byte is `0x7B` (`{`) and the last byte is `0x7D` (`}`).

```javascript
// ✅ PASS — raw JSON bytes
const output   = { yield_opportunities: [/*...*/] };
const proofData = ethers.toUtf8Bytes(JSON.stringify(output));
// proofData[0] = '{', proofData[last] = '}'

// ❌ FAIL — plain text, not JSON
const badOutput  = "Here are some yields: AVAX is good.";
const proofData  = ethers.toUtf8Bytes(badOutput);
// proofData[0] = 'H' → contract reverts (condition fails)
```

### FIELD_EXISTS

The agent checks for the field client-side and ABI-encodes a bool.

```javascript
const fieldName  = "yield_opportunities";   // must match task's fieldName
const output     = { yield_opportunities: [/*...*/] };
const fieldExists = output.hasOwnProperty(fieldName);  // true
const proofData  = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [fieldExists]);
// → abi.encode(true) → 0x0000...0001
```

### VALUE_THRESHOLD

The agent counts array entries and ABI-encodes as uint256.

```javascript
const output     = { yield_opportunities: [a, b, c] };
const count      = output.yield_opportunities.length;   // 3
const proofData  = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [count]);
// → abi.encode(3) → 0x0000...0003
// Contract check: 3 >= threshold(3) → PASS
```

---

## ERC-8004 Registration

Agents must be registered in the ERC-8004 registry before they can call `acceptTask()`. Registration is performed once in `scripts/seed.js`.

### Capabilities

Capabilities are `bytes32` encoded strings representing what an agent can do:

```javascript
const CAPABILITIES = {
  research:    ethers.encodeBytes32String("research"),
  computation: ethers.encodeBytes32String("computation"),
  data:        ethers.encodeBytes32String("data"),
};
```

For the demo, both agents are registered with `["research"]`.

### Trust Score Semantics

In AgentOS, the ERC-8004 trust score means something concrete:

| Score range | Interpretation |
|---|---|
| 80–100 | High-trust agent — verified successful delivery history |
| 50–79 | Moderate trust — mixed delivery history |
| 0–49 | Low-trust agent — significant failure history |

The demo seeds at 87 (high trust, Path A) and 42 (low trust, Path B) to make the contrast obvious.

### Reputation Update Flow

```
submitDelivery() → _settle(taskId, passed) → erc8004.updateReputation(payee, passed)
                                                       ↓
                                               onlyCPE modifier
                                                       ↓
                                               if passed: trustScore += 1
                                               if failed: trustScore -= 1
                                                       ↓
                                               emit ReputationUpdated(agent, passed, newScore)
```

This is the key differentiation from existing ERC-8004 implementations: score changes only happen on outcome-verified settlements, not on transaction completion.

---

## Demo Execution Scripts

### demo/pathA.js — Successful Delivery

```javascript
const { createTask }                              = require("../agents/personalAgent");
const { discoverTasks, acceptTask, submitDelivery } = require("../agents/researchAgent");

(async () => {
  console.log("\n=== PATH A: SUCCESSFUL DELIVERY ===\n");

  // Step 1: Personal Agent creates task
  const { taskId } = await createTask({
    condType:     "VALUE_THRESHOLD",
    fieldName:    "yield_opportunities",
    threshold:    3,
    amountUSDC:   0.5,
    deadlineHours: 1
  });

  // Step 2: Research Agent discovers and accepts
  await discoverTasks();
  await acceptTask(taskId);

  // Step 3: Research Agent executes work
  const output = {
    yield_opportunities: [
      { protocol: "Benqi",    apy: 6.2, token: "AVAX" },
      { protocol: "GoGoPool", apy: 8.1, token: "GGP"  },
      { protocol: "AAVE v3",  apy: 4.8, token: "USDC" }
    ]
  };
  console.log(`[ResearchAgent] Executing: found ${output.yield_opportunities.length} opportunities`);

  // Step 4: Submit delivery (triggers on-chain evaluation + settlement)
  const { passed } = await submitDelivery(taskId, output);
  console.log(`\n✅ Path A complete — passed: ${passed}`);
})();
```

### demo/pathB.js — Failed Delivery, Auto-Refund

```javascript
const { createTask }                              = require("../agents/personalAgent");
const { discoverTasks, acceptTask, submitDelivery } = require("../agents/researchAgent");

(async () => {
  console.log("\n=== PATH B: FAILED DELIVERY (AUTO-REFUND) ===\n");

  const { taskId } = await createTask({
    condType:     "FORMAT_JSON",
    threshold:    0,
    amountUSDC:   0.5,
    deadlineHours: 1
  });

  await discoverTasks();
  await acceptTask(taskId);

  // Low-trust agent returns plain text — FORMAT_JSON will fail
  const badOutput = "Here are some yields: AVAX is good.";
  console.log(`[ResearchAgent] Submitting bad output: "${badOutput}"`);

  const { passed } = await submitDelivery(taskId, badOutput);
  console.log(`\n❌ Path B complete — passed: ${passed} (USDC returned to payer)`);
})();
```

---

## Agent Event Listeners (Production Pattern)

Instead of polling, production agents should use event listeners:

```javascript
// Research Agent listens for new tasks
cpe.on(cpe.filters.TaskCreated(), async (taskId, payer, amount, condHash, deadline, event) => {
  console.log(`New task ${taskId} from ${payer} — ${ethers.formatUnits(amount, 6)} USDC`);
  // Decide whether to accept based on condition + amount + own trust score
});

// Personal Agent listens for settlement
cpe.on(cpe.filters.TaskSettled(taskId), (id, passed, recipient, amount) => {
  console.log(`Task ${id} settled: ${passed ? "PASS" : "FAIL"}`);
});

// ERC-8004 reputation change listener
erc8004.on(erc8004.filters.ReputationUpdated(agentAddress), (agent, passed, newScore) => {
  console.log(`Reputation: ${passed ? "+" : "-"}1 → ${newScore}`);
});
```

---

## x402 Integration Note

In the MVP, the x402 layer is represented by the `createTask()` call replacing the standard HTTP 402 direct-payment flow. The mapping is:

| Standard x402 | AgentOS x402 |
|---|---|
| Research Agent returns HTTP 402 | Research Agent publishes task in CPE contract |
| Personal Agent sends USDC directly | Personal Agent calls `createTask()`, USDC locked |
| Payment irrevocable on send | Payment locked until condition evaluated |
| No recourse on bad output | Auto-return on condition failure |

In a full production integration, the Research Agent's HTTP server would respond to 402 triggers by creating a CPE task on-chain rather than accepting direct payment. The Personal Agent's HTTP client would call `createTask()` instead of sending USDC directly to the payment address.
