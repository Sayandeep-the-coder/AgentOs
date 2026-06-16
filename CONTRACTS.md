# AgentOS — Smart Contract Reference

Two contracts power the system. Deploy in order: `MockERC8004` first, then `ConditionalPaymentEscrow`.

---

## Deployed Addresses (Avalanche Fuji)

> Fill in after deployment. Run `scripts/deploy.js` and copy from `deployments.json`.

| Contract | Address | Snowtrace |
|---|---|---|
| `MockERC8004` | `0x...` | [View](https://testnet.snowtrace.io/address/0x...) |
| `ConditionalPaymentEscrow` | `0x...` | [View](https://testnet.snowtrace.io/address/0x...) |
| USDC (Circle testnet) | `0x5425890298aed601595a70AB815c96711a31Bc65` | [View](https://testnet.snowtrace.io/address/0x5425890298aed601595a70AB815c96711a31Bc65) |

---

## Contract 1 — ConditionalPaymentEscrow.sol

**Purpose:** Locks USDC on task creation, evaluates delivery proof on-chain, auto-settles payment to payee or returns to payer.

### Enums

```solidity
enum TaskStatus {
    LOCKED,         // USDC locked, no agent assigned yet
    PENDING_PROOF,  // Agent accepted, awaiting submitDelivery()
    SETTLED_PASS,   // Condition met, USDC released to Research Agent
    SETTLED_FAIL    // Condition failed or expired, USDC returned to payer
}

enum ConditionType {
    FORMAT_JSON,      // 0 — output bytes must open with '{' and close with '}'
    FIELD_EXISTS,     // 1 — agent attests to presence of a named field
    VALUE_THRESHOLD   // 2 — numeric value in output meets minimum threshold
}
```

### Structs

```solidity
struct Condition {
    ConditionType conditionType;
    bytes32       fieldName;   // used by FIELD_EXISTS — e.g. "yield_opportunities"
    uint256       threshold;   // used by VALUE_THRESHOLD — e.g. 3
}

struct Task {
    address    payer;          // Personal Agent who created the task
    address    payee;          // Research Agent who accepted (address(0) if none)
    uint256    amount;         // USDC amount in 6-decimal units (0.5 USDC = 500000)
    bytes32    conditionHash;  // keccak256(abi.encode(condType, fieldName, threshold))
    Condition  condition;      // full condition struct
    uint256    deadline;       // unix timestamp — task expires after this
    TaskStatus status;         // current task state
    bytes32    outputHash;     // keccak256 of submitted output (set on delivery)
    string     resultUri;      // pointer to output (data URI or IPFS)
}
```

### State Variables

| Variable | Type | Description |
|---|---|---|
| `usdc` | `IERC20 immutable` | USDC token contract on Fuji |
| `erc8004` | `IERC8004 immutable` | ERC-8004 agent registry |
| `tasks` | `mapping(uint256 => Task)` | All tasks by taskId |
| `taskCount` | `uint256` | Auto-incrementing task counter |

### Functions

---

#### `createTask()`

```solidity
function createTask(
    uint256       amount,      // USDC amount (6 decimals)
    ConditionType condType,    // FORMAT_JSON | FIELD_EXISTS | VALUE_THRESHOLD
    bytes32       fieldName,   // required field name (bytes32 encoded)
    uint256       threshold,   // minimum value for VALUE_THRESHOLD
    uint256       deadline     // unix timestamp (must be > block.timestamp)
) external nonReentrant returns (uint256 taskId)
```

**What it does:**
1. Pulls `amount` USDC from `msg.sender` into the contract (`safeTransferFrom`)
2. Creates a `Task` struct with status `LOCKED`
3. Computes and stores `conditionHash = keccak256(abi.encode(condType, fieldName, threshold))`
4. Emits `TaskCreated`

**Requires:**
- Caller has called `USDC.approve(cpeAddress, amount)` first
- `amount > 0`
- `deadline > block.timestamp`

**Returns:** `taskId` — the index of the newly created task.

---

#### `acceptTask()`

```solidity
function acceptTask(uint256 taskId) external
```

**What it does:**
1. Verifies caller is registered in ERC-8004 (`getAgent().registered == true`)
2. Sets `task.payee = msg.sender`
3. Sets `task.status = PENDING_PROOF`
4. Emits `TaskAccepted`

**Requires:**
- `task.status == LOCKED`
- `task.payee == address(0)` (not yet accepted)
- `block.timestamp < task.deadline`
- Caller registered in ERC-8004 registry

---

#### `submitDelivery()`

```solidity
function submitDelivery(
    uint256 taskId,
    bytes32 outputHash,      // keccak256 of the output string
    string  calldata resultUri, // data URI or IPFS URI pointing to output
    bytes   calldata proofData  // encoded evaluation data (see Proof Encoding below)
) external nonReentrant
```

**What it does:**
1. Stores `outputHash` and `resultUri` on the task
2. Emits `DeliverySubmitted`
3. Calls `_evaluateCondition(task.condition, proofData)` → `bool passed`
4. Calls `_settle(taskId, passed)` — transfers USDC and updates ERC-8004

**Requires:**
- `task.status == PENDING_PROOF`
- `msg.sender == task.payee`
- `block.timestamp < task.deadline`

**This function is atomic.** Evaluation and settlement happen in the same transaction. There is no pending state after `submitDelivery()` — the task is immediately `SETTLED_PASS` or `SETTLED_FAIL`.

---

#### `claimExpired()`

```solidity
function claimExpired(uint256 taskId) external nonReentrant
```

**What it does:** If a task has passed its deadline without settling, the payer can reclaim USDC. If a Research Agent had accepted the task, their ERC-8004 score is decremented (treated as failure).

**Requires:**
- `block.timestamp > task.deadline`
- `task.status == LOCKED || task.status == PENDING_PROOF`
- `msg.sender == task.payer`

---

#### `getTask()`

```solidity
function getTask(uint256 taskId) external view returns (Task memory)
```

Returns the full `Task` struct. Used by the dashboard to poll status.

---

#### `getOpenTasks()`

```solidity
function getOpenTasks() external view returns (uint256[] memory)
```

Returns array of `taskId`s where `status == LOCKED`. Used by Research Agent to discover available work.

---

### Internal Functions

#### `_evaluateCondition()`

```solidity
function _evaluateCondition(
    Condition memory cond,
    bytes memory proofData
) internal pure returns (bool)
```

| ConditionType | proofData format | Pass condition |
|---|---|---|
| `FORMAT_JSON` (0) | Raw output bytes | `proofData[0] == '{'` and `proofData[last] == '}'` |
| `FIELD_EXISTS` (1) | `abi.encode(bool)` | Decoded bool is `true` |
| `VALUE_THRESHOLD` (2) | `abi.encode(uint256)` | Decoded count `>= condition.threshold` |

#### `_settle()`

```solidity
function _settle(uint256 taskId, bool passed) internal
```

On `passed = true`: transfers USDC to `task.payee`, sets status `SETTLED_PASS`, calls `erc8004.updateReputation(payee, true)`.

On `passed = false`: transfers USDC to `task.payer`, sets status `SETTLED_FAIL`, calls `erc8004.updateReputation(payee, false)`.

---

### Events

```solidity
event TaskCreated(
    uint256 indexed taskId,
    address indexed payer,
    uint256 amount,
    bytes32 conditionHash,
    uint256 deadline
);

event TaskAccepted(
    uint256 indexed taskId,
    address indexed payee
);

event DeliverySubmitted(
    uint256 indexed taskId,
    address indexed agent,
    bytes32 outputHash,
    string resultUri
);

event TaskSettled(
    uint256 indexed taskId,
    bool passed,
    address recipient,
    uint256 amount
);
```

---

### Proof Data Encoding Reference

The Research Agent must encode `proofData` correctly for the condition type before calling `submitDelivery()`.

**FORMAT_JSON**
```javascript
// Pass the raw output as UTF-8 bytes
// Contract checks first byte == '{' and last byte == '}'
const proofData = ethers.toUtf8Bytes(JSON.stringify(output));
```

**FIELD_EXISTS**
```javascript
// Check if the required field exists, encode as bool
const fieldExists = output.hasOwnProperty("yield_opportunities");
const proofData = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [fieldExists]);
```

**VALUE_THRESHOLD**
```javascript
// Count the array entries, encode as uint256
const count = (output.yield_opportunities || []).length;
const proofData = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [count]);
```

---

## Contract 2 — MockERC8004.sol

**Purpose:** Minimal on-chain agent identity + reputation registry. Stands in for a full ERC-8004 deployment for the hackathon.

> In production, `ConditionalPaymentEscrow` would interface with a deployed ERC-8004 standard registry. For the MVP, this contract is deployed and controlled by the team.

### State Variables

| Variable | Type | Description |
|---|---|---|
| `agents` | `mapping(address => Agent)` | All registered agents |
| `cpeContract` | `address` | Only address allowed to call `updateReputation()` |

### Struct

```solidity
struct Agent {
    uint256   trustScore;    // 0–100 reputation score
    bytes32[] capabilities;  // e.g. ["research", "computation"]
    bool      registered;    // must be true to accept tasks
}
```

### Functions

---

#### `setCPEContract()`

```solidity
function setCPEContract(address _cpe) external
```

One-time setup. Call after deploying CPE. Sets the `onlyCPE` access control. Cannot be called again after set (immutable binding).

---

#### `registerAgent()`

```solidity
function registerAgent(
    address   agent,
    uint256   initialScore,
    bytes32[] calldata caps
) external
```

Registers an agent with an initial trust score and capability list. For the demo, this is called in `scripts/seed.js`:
- Personal Agent: score `87`, capability `"research"`
- Research Agent (low trust): score `42`, capability `"research"`

---

#### `updateReputation()`

```solidity
function updateReputation(address agent, bool passed) external onlyCPE
```

Called automatically by the CPE contract on every settlement. Cannot be called by any other address.

- `passed = true` → `trustScore += 1` (capped at 100)
- `passed = false` → `trustScore -= 1` (floored at 0)

---

#### `getAgent()`

```solidity
function getAgent(address agent) external view returns (
    uint256   trustScore,
    bytes32[] memory capabilities,
    bool      registered
)
```

Used by:
- CPE contract: checks `registered` before allowing `acceptTask()`
- Dashboard: displays current trust score
- Research Agent: self-checks before accepting tasks

---

### Events

```solidity
event AgentRegistered(address indexed agent, uint256 initialScore);
event ReputationUpdated(address indexed agent, bool passed, uint256 newScore);
```

---

## IERC8004 Interface (used by CPE)

```solidity
interface IERC8004 {
    function updateReputation(address agent, bool passed) external;
    function getAgent(address agent) external view returns (
        uint256 trustScore,
        bytes32[] memory capabilities,
        bool registered
    );
}
```

---

## OpenZeppelin Dependencies

| Import | Usage |
|---|---|
| `IERC20` | USDC token interface |
| `SafeERC20` | `safeTransfer` + `safeTransferFrom` — handles non-standard USDC returns |
| `ReentrancyGuard` | `nonReentrant` modifier on all state-changing functions |

```bash
npm install @openzeppelin/contracts
```

---

## ABI Fragments (ethers.js)

Minimal ABI fragments for agent scripts and dashboard. Full ABIs are auto-generated by Hardhat in `artifacts/`.

**CPE — Personal Agent needs:**
```javascript
const CPE_PAYER_ABI = [
  "function createTask(uint256,uint8,bytes32,uint256,uint256) returns (uint256)",
  "function getTask(uint256) view returns (tuple(address,address,uint256,bytes32,tuple(uint8,bytes32,uint256),uint256,uint8,bytes32,string))",
  "function getOpenTasks() view returns (uint256[])",
  "event TaskCreated(uint256 indexed,address indexed,uint256,bytes32,uint256)",
  "event TaskSettled(uint256 indexed,bool,address,uint256)"
];
```

**CPE — Research Agent needs:**
```javascript
const CPE_PAYEE_ABI = [
  "function getOpenTasks() view returns (uint256[])",
  "function acceptTask(uint256)",
  "function submitDelivery(uint256,bytes32,string,bytes)",
  "event TaskAccepted(uint256 indexed,address indexed)",
  "event TaskSettled(uint256 indexed,bool,address,uint256)"
];
```

**ERC-8004:**
```javascript
const ERC8004_ABI = [
  "function getAgent(address) view returns (uint256,bytes32[],bool)",
  "event ReputationUpdated(address indexed,bool,uint256)"
];
```

**USDC (ERC-20):**
```javascript
const USDC_ABI = [
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)"
];
```

---

## Common Errors and Causes

| Revert message | Cause | Fix |
|---|---|---|
| `"Amount must be > 0"` | Passed `0` as USDC amount | Use `ethers.parseUnits("0.5", 6)` = `500000` |
| `"Deadline must be future"` | Deadline ≤ `block.timestamp` | Add at least 3600 seconds to `Date.now()/1000` |
| `"Only CPE contract"` | Called `updateReputation()` directly | Do not call ERC-8004 directly; CPE calls it |
| `"Already set"` | Called `setCPEContract()` twice | One-time setup only |
| `"Agent not registered"` | Research Agent not in ERC-8004 | Run `scripts/seed.js` before demo |
| `"Only assigned agent"` | Wrong wallet calling `submitDelivery()` | Use `RESEARCH_AGENT_KEY` signer |
| `"Task not available"` | Task already accepted | Only one agent per task |
| `"Not expired yet"` | Called `claimExpired()` before deadline | Wait for deadline to pass |
| ERC-20 transfer fail | Insufficient USDC or no approval | Run `usdc.approve(cpeAddr, amount)` first |
