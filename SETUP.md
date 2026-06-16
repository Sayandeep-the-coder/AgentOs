# AgentOS — Setup Guide

End-to-end setup from zero to running demo. Follow in order — each section depends on the one before it.

---

## Prerequisites

| Requirement | Version | Check |
|---|---|---|
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Git | Any | `git --version` |
| MetaMask | Latest | Browser extension installed |

You also need:
- Two funded Avalanche Fuji wallets (Personal Agent + Research Agent)
- Testnet AVAX for gas on both wallets
- Testnet USDC on the Personal Agent wallet

---

## Step 1 — Clone and Install

```bash
git clone https://github.com/your-org/agentos
cd agentos
npm install
```

Install dashboard dependencies separately:
```bash
cd dashboard
npm install
cd ..
```

---

## Step 2 — Wallet Setup

### 2.1 Create Two Wallets

You need two separate Ethereum wallets. They can both be Hardhat-generated or MetaMask exports.

**Option A — Generate with ethers.js (quickest)**
```javascript
// Run once in Node REPL
const { ethers } = require("ethers");
const w1 = ethers.Wallet.createRandom();
const w2 = ethers.Wallet.createRandom();
console.log("Personal Agent:", w1.address, w1.privateKey);
console.log("Research Agent:", w2.address, w2.privateKey);
```

**Option B — Use MetaMask**
Create two accounts in MetaMask. Export private keys from Settings > Accounts > Export Private Key.

### 2.2 Add Avalanche Fuji to MetaMask

```
Network Name:    Avalanche Fuji C-Chain
RPC URL:         https://api.avax-test.network/ext/bc/C/rpc
Chain ID:        43113
Currency Symbol: AVAX
Block Explorer:  https://testnet.snowtrace.io
```

Or click "Add Network" and search for "Avalanche Fuji" — MetaMask has it listed.

---

## Step 3 — Fund Wallets

### 3.1 Get Testnet AVAX (for gas)

Go to [faucet.avax.network](https://faucet.avax.network)

- Select network: **Fuji (C-Chain)**
- Paste **Personal Agent** address → request
- Paste **Research Agent** address → request

Each request gives 2 AVAX. Both wallets need gas — fund both.

> If the faucet is rate-limited, try [faucet.quicknode.com](https://faucet.quicknode.com/avalanche/fuji) as a backup.

### 3.2 Get Testnet USDC

Go to [faucet.circle.com](https://faucet.circle.com)

- Select blockchain: **Avalanche**
- Paste **Personal Agent** address (the one locking funds)
- Request USDC

You need at least 1 USDC for two demo runs (0.5 USDC each). Request a few extras to be safe.

> USDC on Fuji has 6 decimals. 1 USDC = 1,000,000 units on-chain.

Verify receipt in MetaMask by adding the USDC token:
```
Token Address: 0x5425890298aed601595a70AB815c96711a31Bc65
Symbol:        USDC
Decimals:      6
```

---

## Step 4 — Environment Configuration

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Wallet private keys (with 0x prefix)
PERSONAL_AGENT_KEY=0xabc...your_personal_agent_private_key
RESEARCH_AGENT_KEY=0xdef...your_research_agent_private_key

# Avalanche Fuji RPC
# Use a dedicated endpoint (Alchemy/Infura) to avoid public RPC rate limits
FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc

# USDC on Fuji (Circle testnet)
USDC_FUJI=0x5425890298aed601595a70AB815c96711a31Bc65

# Filled in after deployment (Step 5)
CPE_ADDRESS=
ERC8004_ADDRESS=
```

> **Security:** `.env` is git-ignored. Never commit private keys. These are testnet wallets only.

### Optional: Dedicated RPC

The public Fuji RPC (`api.avax-test.network`) can rate-limit during a live demo. For reliability, use a dedicated endpoint:

- [Alchemy](https://www.alchemy.com) → Create app → Select Avalanche Fuji → Copy HTTP URL
- [Infura](https://infura.io) → Create project → Enable Avalanche → Copy Fuji endpoint

Add it to `.env` as `FUJI_RPC_URL` and update `hardhat.config.js`:

```javascript
fuji: {
  url: process.env.FUJI_RPC_URL,
  ...
}
```

---

## Step 5 — Deploy Contracts

```bash
npx hardhat run scripts/deploy.js --network fuji
```

Expected output:
```
Deploying with: 0xPersonalAgentAddress...
Deploying MockERC8004...
MockERC8004: 0xAAAA...
Deploying ConditionalPaymentEscrow...
CPE: 0xBBBB...
Linking CPE to ERC8004...  ✓
deployments.json written.
```

This creates `deployments.json` in the project root:
```json
{
  "erc8004": "0xAAAA...",
  "cpe": "0xBBBB...",
  "usdc": "0x5425890298aed601595a70AB815c96711a31Bc65",
  "network": "fuji"
}
```

Copy the deployed addresses into `.env`:
```bash
CPE_ADDRESS=0xBBBB...
ERC8004_ADDRESS=0xAAAA...
```

**Verify on Snowtrace:**
- Go to `testnet.snowtrace.io/address/0xBBBB...`
- You should see the contract creation transaction

---

## Step 6 — Seed Demo Agents

This registers both agents in ERC-8004 with their initial trust scores.

```bash
npx hardhat run scripts/seed.js --network fuji
```

Expected output:
```
Personal Agent registered: 0xPersonal... score=87 capability=research ✓
Research Agent registered: 0xResearch... score=42 capability=research ✓
```

**Verify in ethers.js REPL (optional):**
```javascript
const { ethers } = require("ethers");
const deps = require("./deployments.json");
const provider = new ethers.JsonRpcProvider(process.env.FUJI_RPC_URL);
const erc8004 = new ethers.Contract(deps.erc8004, [
  "function getAgent(address) view returns (uint256, bytes32[], bool)"
], provider);

const [score, caps, registered] = await erc8004.getAgent("0xResearchAgentAddr...");
console.log(score.toString(), registered); // 42, true
```

---

## Step 7 — Run the Agents

Run each agent in a separate terminal window.

### Terminal 1 — Path A (Successful Delivery)

```bash
node demo/pathA.js
```

Expected output:
```
[PersonalAgent] Approving USDC...
[PersonalAgent] Tx: 0x111... ✓
[PersonalAgent] Creating task (VALUE_THRESHOLD, threshold=3)...
[PersonalAgent] Task 0 created — Snowtrace: https://testnet.snowtrace.io/tx/0x222...
[ResearchAgent] Open tasks: [0]
[ResearchAgent] ERC-8004 check: score=87, registered=true
[ResearchAgent] Accepting task 0...
[ResearchAgent] Tx: 0x333... ✓
[ResearchAgent] Executing work...
[ResearchAgent] Output: { yield_opportunities: [ {Benqi,6.2}, {GoGoPool,8.1}, {AAVEv3,4.8} ] }
[ResearchAgent] count=3 >= threshold=3 → encoding proof
[ResearchAgent] Submitting delivery...
[CPEContract]   Condition: PASS ✅
[CPEContract]   USDC released to Research Agent
[CPEContract]   Tx: https://testnet.snowtrace.io/tx/0x444...
[ERC8004]       Score updated: 87 → 88
[ERC8004]       Tx: https://testnet.snowtrace.io/tx/0x555...
```

### Terminal 2 — Path B (Failed Delivery, Auto-Refund)

```bash
node demo/pathB.js
```

Expected output:
```
[PersonalAgent] Task 1 created — Snowtrace: https://testnet.snowtrace.io/tx/0x666...
[ResearchAgent] Low-trust agent (score=42) accepting task 1...
[ResearchAgent] Submitting garbage: "Here are some yields: AVAX is good."
[CPEContract]   Condition: FAIL ❌ (FORMAT_JSON — not valid JSON)
[CPEContract]   USDC returned to Personal Agent
[CPEContract]   Tx: https://testnet.snowtrace.io/tx/0x777...
[ERC8004]       Score updated: 42 → 41
```

---

## Step 8 — Run the Dashboard

```bash
cd dashboard
npm run dev
```

Open `http://localhost:5173` in your browser.

Connect MetaMask with the **Personal Agent** wallet. The dashboard should:

1. Detect Fuji network (will prompt to switch if on wrong chain)
2. Show ConditionBuilder panel
3. Show empty EscrowStatus (updates as tasks are created)

### Dashboard .env

Create `dashboard/.env`:
```bash
VITE_CPE_ADDRESS=0xBBBB...
VITE_ERC8004_ADDRESS=0xAAAA...
VITE_USDC_ADDRESS=0x5425890298aed601595a70AB815c96711a31Bc65
VITE_FUJI_RPC=https://api.avax-test.network/ext/bc/C/rpc
VITE_SNOWTRACE_BASE=https://testnet.snowtrace.io
```

---

## Step 9 — Verification Checklist

Before the demo, verify every item below on Snowtrace.

```
[ ] MockERC8004 deployed — contract visible on Snowtrace
[ ] CPE deployed — contract visible on Snowtrace
[ ] setCPEContract() called — check ERC8004.cpeContract() == CPE address
[ ] Personal Agent registered — getAgent() returns score=87, registered=true
[ ] Research Agent registered — getAgent() returns score=42, registered=true
[ ] Personal Agent has USDC — balanceOf() > 0
[ ] Both wallets have AVAX — balanceOf() > 0.1 AVAX each
[ ] Path A runs clean — 3 Snowtrace tx links generated
[ ] Path B runs clean — USDC refunded, score decremented
[ ] Dashboard shows live status — polls correctly
[ ] All Snowtrace links clickable in dashboard
```

---

## Hardhat Test (Unit Tests)

Run the test suite before deploying to Fuji:

```bash
npx hardhat test
```

Tests cover:
- `createTask()` — USDC transfer, event emission, status
- `acceptTask()` — ERC-8004 gating, status change
- `submitDelivery()` — all three condition types (pass + fail each)
- `claimExpired()` — deadline enforcement, payer reclaim
- `updateReputation()` — access control (`onlyCPE`)

Run on Hardhat network (local, instant):
```bash
npx hardhat test --network hardhat
```

---

## Troubleshooting

**"insufficient funds for gas"**
Top up the affected wallet at [faucet.avax.network](https://faucet.avax.network).

**"execution reverted: Agent not registered"**
The Research Agent wallet isn't in ERC-8004. Re-run `scripts/seed.js`.

**"execution reverted: Only CPE contract"**
`setCPEContract()` wasn't called after deployment, or was called with the wrong address. Check `deployments.json` matches the addresses in `.env`.

**MetaMask "nonce too high"**
Reset the MetaMask account: Settings > Advanced > Clear activity tab data.

**Dashboard not updating**
Check browser console for RPC errors. The public Fuji RPC sometimes throttles — switch to a dedicated Alchemy/Infura endpoint.

**USDC approval fails**
The Personal Agent wallet may not have enough USDC. Check balance at Snowtrace and re-request from Circle faucet.

**"already known" transaction**
Hardhat is resubmitting the same nonce. Increment nonce manually or reset MetaMask account state.
