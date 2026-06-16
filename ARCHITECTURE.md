# AgentOS — Architecture

## Overview

AgentOS is built around a single primitive: the **Conditional Payment Escrow (CPE)**. It is not a marketplace, not an agent framework, and not a competing L1. It is one smart contract that adds the accountability layer missing from every existing x402 + ERC-8004 deployment.

Everything else — the agent scripts, the dashboard, the ERC-8004 registry — is either integration scaffolding or a demonstration harness. The CPE contract is the product.

---

## System Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        USER / DEMO OPERATOR                          │
│                   (opens dashboard, sets condition)                  │
└───────────────────────────────┬──────────────────────────────────────┘
                                │  browser
                ┌───────────────▼───────────────────┐
                │         DASHBOARD (React)          │
                │                                    │
                │  ┌─────────────────────────────┐  │
                │  │  ConditionBuilder.jsx        │  │
                │  │  → select type, field, N     │  │
                │  │  → set USDC amount           │  │
                │  └────────────┬────────────────-┘  │
                │               │ createTask()        │
                │  ┌────────────▼────────────────┐   │
                │  │  EscrowStatus.jsx            │   │
                │  │  → polls every 3s            │   │
                │  │  → shows LOCKED/SETTLED/...  │   │
                │  └─────────────────────────────-┘  │
                │  ┌──────────────────────────────┐  │
                │  │  DeliveryViewer.jsx           │  │
                │  │  → output + condition result  │  │
                │  │  → Snowtrace tx links         │  │
                │  └──────────────────────────────┘  │
                └──────────┬────────────────────┬─────┘
                           │ ethers.js           │ ethers.js
          ┌────────────────▼──────┐  ┌──────────▼───────────────────┐
          │   PERSONAL AGENT      │  │   RESEARCH AGENT              │
          │   (Node.js)           │  │   (Node.js)                   │
          │                       │  │                               │
          │   1. Approve USDC     │  │   1. getOpenTasks()           │
          │   2. createTask()     │  │   2. acceptTask()             │
          │   3. monitorTask()    │  │   3. Execute task logic       │
          │                       │  │   4. buildProofData()         │
          │   Holds: USDC budget  │  │   5. submitDelivery()         │
          │   Signs: MetaMask     │  │                               │
          │   or private key      │  │   Holds: capability to deliver│
          └────────────┬──────────┘  └──────────┬───────────────────┘
                       │                         │
                       └───────────┬─────────────┘
                                   │  Avalanche Fuji C-Chain
          ┌────────────────────────▼──────────────────────────────────┐
          │                  CPE CONTRACT                              │
          │              ConditionalPaymentEscrow.sol                  │
          │                                                            │
          │   createTask()      → locks USDC, emits TaskCreated       │
          │   acceptTask()      → ERC-8004 gated, assigns payee       │
          │   submitDelivery()  → evaluates condition, auto-settles    │
          │   _evaluateCondition() → FORMAT_JSON | FIELD_EXISTS |     │
          │                          VALUE_THRESHOLD                   │
          │   _settle()         → transfers USDC, calls ERC-8004      │
          │   claimExpired()    → payer reclaims after deadline        │
          └────────────────────────┬──────────────────────────────────┘
                                   │  updateReputation()
          ┌────────────────────────▼──────────────────────────────────┐
          │               ERC-8004 REGISTRY                           │
          │                   MockERC8004.sol                          │
          │                                                            │
          │   registerAgent()   → sets initial trustScore + caps      │
          │   updateReputation()→ PASS: score+1 · FAIL: score-1       │
          │   getAgent()        → returns trustScore, capabilities     │
          └────────────────────────────────────────────────────────────┘
```

---

## Component 01 — CPE Smart Contract

**File:** `contracts/CPEContract.sol`  
**Deployed on:** Avalanche Fuji C-Chain  
**Language:** Solidity 0.8.19  

The CPE contract is the only stateful component in the system. Both agents interact exclusively with it. There is no central server, no off-chain coordinator, no oracle.

### State Machine

Each task moves through exactly one of these paths:

```
                    createTask()
                         │
                         ▼
                      LOCKED
                         │
               ┌─────────┴──────────┐
          acceptTask()         deadline passes
               │                    │
               ▼                    ▼
         PENDING_PROOF         claimExpired()
               │                    │
      submitDelivery()              SETTLED_FAIL
               │
       ┌───────┴────────┐
    PASS eval        FAIL eval
       │                │
       ▼                ▼
SETTLED_PASS       SETTLED_FAIL
(USDC → payee)    (USDC → payer)
```

### Condition Evaluation (On-Chain)

The `_evaluateCondition()` function runs inside the same transaction as `submitDelivery()`. There is no callback, no oracle, no delay.

```
proofData (bytes calldata)
       │
       ├─ conditionType == FORMAT_JSON
       │   └─ check: proofData[0] == 0x7B && proofData[last] == 0x7D
       │              ( '{' ... '}' boundary check )
       │
       ├─ conditionType == FIELD_EXISTS
       │   └─ abi.decode(proofData, (bool))
       │         Research Agent self-attests field presence
       │
       └─ conditionType == VALUE_THRESHOLD
           └─ abi.decode(proofData, (uint256))
                 count >= condition.threshold
```

> **Design note:** The on-chain evaluation is intentionally minimal for the MVP. The contract checks the *structure* of the proof, not the semantic truth of the content. The Research Agent submits structured proof data; the contract verifies it against the pre-encoded condition. This is sufficient to demonstrate accountability without requiring Solidity JSON parsing libraries.

### Security Properties

| Property | Mechanism |
|---|---|
| Reentrancy protection | `ReentrancyGuard` from OpenZeppelin |
| Safe ERC-20 transfers | `SafeERC20` — handles non-standard USDC returns |
| Deadline enforcement | `block.timestamp < task.deadline` checked in `acceptTask()` and `submitDelivery()` |
| Agent gating | `acceptTask()` requires `erc8004.getAgent(msg.sender).registered == true` |
| Payee exclusivity | Only the assigned `task.payee` can call `submitDelivery()` |
| ERC-8004 write access | `MockERC8004.onlyCPE` modifier — only CPE contract can update scores |

---

## Component 02 — Agent Task Protocol

**Files:** `agents/personalAgent.js`, `agents/researchAgent.js`  
**Runtime:** Node.js 18+ · ethers.js v6  

The agent scripts are the x402-layer integration point. In a production system, these would be autonomous LLM agents; for the hackathon, they are controlled Node.js scripts that demonstrate the full autonomous flow.

### Personal Agent Responsibilities

1. Approve USDC spend on the CPE contract address
2. Call `createTask()` with condition parameters
3. Monitor task status (poll or event listener)
4. No action required post-task creation — the contract handles everything

### Research Agent Responsibilities

1. Call `getOpenTasks()` to discover available tasks
2. Check its own ERC-8004 registration before accepting
3. Call `acceptTask()` to claim the task
4. Execute the actual work (query, computation, data fetch)
5. Build `proofData` encoded correctly for the condition type
6. Call `submitDelivery()` — this triggers evaluation and settlement atomically

### x402 Integration Point

The x402 modification is in step 1 of the Personal Agent flow. Instead of sending USDC directly in response to an HTTP 402, the Personal Agent calls `createTask()`, which pulls USDC into the CPE contract. The Research Agent, instead of returning a response to an HTTP request, calls `submitDelivery()` on the contract.

```
Standard x402:          Personal Agent  ──USDC──▶  Research Agent
                                                   (payment irrevocable)

AgentOS x402:           Personal Agent  ──USDC──▶  CPE Contract
                                                          │
                                         condition eval   │
                                                     ┌────▼───────┐
                                                     │ PASS: payee │
                                                     │ FAIL: payer │
                                                     └─────────────┘
```

---

## Component 03 — Dashboard UI

**Directory:** `dashboard/src/`  
**Stack:** React 18 · TailwindCSS · ethers.js v6  

The dashboard has three panels that are active during the demo:

**ConditionBuilder** — Lets the operator (playing Personal Agent) define the task and condition before locking USDC. Outputs: condition type, field name, threshold, USDC amount.

**EscrowStatus** — Polls the CPE contract every 3 seconds. Displays: current task status (color-coded), USDC amount in escrow, assigned Research Agent address, agent trust score from ERC-8004, and all Snowtrace transaction links as they appear.

**DeliveryViewer** — Shows the submitted output (fetched from `resultUri`), the condition that was evaluated, and the pass/fail result with the decoded `proofData`.

### Wallet Architecture

The dashboard connects to MetaMask for the Personal Agent role (condition setup + USDC approval only). The Research Agent operates headlessly via a Node.js private key — this is what allows the demo to show "zero human approvals" in the autonomous settlement flow.

---

## Data Flow — Full Transaction Lifecycle

```
Step 1  Operator opens dashboard, selects:
        conditionType = VALUE_THRESHOLD
        fieldName = "yield_opportunities"
        threshold = 3
        amount = 0.5 USDC

Step 2  Dashboard calls USDC.approve(cpeAddress, 500000)  ← 6 decimals
        MetaMask signs this transaction
        Snowtrace link 1 appears in UI

Step 3  Dashboard calls CPE.createTask(500000, 2, fieldBytes32, 3, deadline)
        Contract pulls 500000 USDC from Personal Agent
        Contract stores task, emits TaskCreated(taskId=0, ...)
        Task status: LOCKED
        Snowtrace link 2 appears in UI

Step 4  Research Agent script polls getOpenTasks() → [0]
        Calls ERC8004.getAgent(researchAgentAddr) → trustScore=87, registered=true
        Calls CPE.acceptTask(0)
        Task status: PENDING_PROOF
        Snowtrace link 3 appears in UI

Step 5  Research Agent executes work:
        output = { yield_opportunities: [{...}, {...}, {...}] }
        count = output.yield_opportunities.length   // = 3
        proofData = abi.encode(uint256, 3)
        outputHash = keccak256(JSON.stringify(output))
        resultUri = "data:application/json,..."

Step 6  Research Agent calls CPE.submitDelivery(0, outputHash, resultUri, proofData)
        Contract runs _evaluateCondition():
          conditionType == VALUE_THRESHOLD
          abi.decode(proofData) → count = 3
          3 >= 3 → PASS
        Contract runs _settle():
          task.status = SETTLED_PASS
          USDC.transfer(researchAgent, 500000)
          ERC8004.updateReputation(researchAgent, true) → score 87→88
        Task status: SETTLED_PASS
        Snowtrace links 4 + 5 appear in UI

Step 7  Dashboard polls getTask(0) → SETTLED_PASS
        EscrowStatus panel updates to green
        DeliveryViewer shows submitted JSON + PASS badge
        ERC-8004 score trail shows 87 → 88
```

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Avalanche Fuji C-Chain                  │
│                   Chain ID: 43113                        │
│                                                          │
│   ┌────────────────────┐  ┌─────────────────────────┐   │
│   │  MockERC8004       │  │  ConditionalPayment      │   │
│   │  (deployed first)  │  │  Escrow                  │   │
│   │                    │  │  (deployed second)       │   │
│   │  setCPEContract()  │◄─│  calls updateReputation()│   │
│   │  ← called after    │  │  via IERC8004 interface  │   │
│   │    CPE deploy      │  │                          │   │
│   └────────────────────┘  └─────────────────────────┘   │
│                                                          │
│   USDC (Circle testnet):  0x5425890298aed601595a70A...   │
└─────────────────────────────────────────────────────────┘
```

### Deployment Order (critical)

1. Deploy `MockERC8004`
2. Deploy `ConditionalPaymentEscrow(usdcAddress, erc8004Address)`
3. Call `MockERC8004.setCPEContract(cpeAddress)` — this is the access control link
4. Call `MockERC8004.registerAgent(personalAgentAddr, 87, [...])` — seed Path A agent
5. Call `MockERC8004.registerAgent(researchAgentAddr, 42, [...])` — seed Path B agent

Skipping step 3 means the CPE contract cannot update reputation. The `onlyCPE` modifier will revert every `updateReputation()` call.

---

## Competitive Architecture Comparison

| Feature | Kite | x402 raw | ERC-8004 | AgentOS |
|---|---|---|---|---|
| Payment standard | x402 | x402 | — | x402 (modified) |
| Agent identity | Kite Passport | — | ✓ | ERC-8004 |
| Spending limits | Session-based | — | — | Condition-based |
| Human approval | Required | — | — | **None** |
| Output verification | — | — | — | **On-chain CPE** |
| Reputation signal | — | — | Transaction count | **Verified delivery** |
| Escrow mechanism | — | — | — | **USDC in contract** |
| Auto-refund on failure | — | — | — | **Yes** |

---

## Scaling Path

The CPE is designed as a composable primitive. After the hackathon:

```
MVP (Hackathon)
  └─ 3 condition types · single escrow · Fuji testnet

Next (Mainnet)
  └─ 10+ condition types (LLM graded, API response codes, schema validation)
  └─ Multi-step milestone escrow
  └─ Cross-chain via Avalanche Warp Messaging

Protocol Play
  └─ CPE specification as an open Avalanche standard
  └─ Any x402 marketplace requires CPE compliance
  └─ Agent reputation = CPE settlement history
```
