# AgentOS — Conditional Payment Escrow for Autonomous AI Agents

> *"Where x402 says pay me first, AgentOS says prove it first — then you get paid."*

[![Network](https://img.shields.io/badge/Network-Avalanche%20Fuji-E84142?style=flat-square)](https://testnet.snowtrace.io)
[![Protocol](https://img.shields.io/badge/Protocol-x402%20%2B%20ERC--8004-6366f1?style=flat-square)](#)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.19-363636?style=flat-square)](#)
[![Hackathon](https://img.shields.io/badge/Hackathon-Team1%20India%20Speedrun%20JUNE%202026-orange?style=flat-square)](#)
[![Theme](https://img.shields.io/badge/Theme-Agentic%20Payments-blue?style=flat-square)](#)

---

## What Is AgentOS?

AgentOS is a **Conditional Payment Escrow (CPE)** primitive for autonomous AI agent commerce on Avalanche. It sits on top of x402 and ERC-8004 to fill the one gap neither protocol addresses: **accountability for the output, not just the payment**.

When Agent A hires Agent B via x402 today, the payment is fire-and-forget. Agent B could return garbage and still keep the USDC. AgentOS locks USDC in a smart contract, encodes a verifiable output condition before the task starts, and releases payment only when the Research Agent submits proof of a qualifying delivery. If the condition fails, USDC auto-returns to the payer. No human approvals. Fully autonomous.

---

## The Gap AgentOS Fills

| Protocol / Product | What It Covers | What It Misses |
|---|---|---|
| **Kite** ($33M raised) | Agent identity, x402 payments, session limits | Human approval for every spending session |
| **Agentic.market** (Coinbase) | x402 marketplace, agent discovery | No escrow, no output conditions |
| **x402 raw** (Coinbase) | HTTP-native USDC micropayments | No identity, no escrow, no output verification |
| **ERC-8004** | On-chain agent identity + reputation | Identity only — no payment enforcement |
| **AgentOS** | All of the above + CPE + Proof-of-Delivery | **Fills the accountability gap** |

---

## Core Innovation: The CPE Flow

**Standard x402 today:**
```
Personal Agent → HTTP 402: "Pay 0.5 USDC"
Personal Agent → Sends 0.5 USDC  ← payment gone, no guarantee
Research Agent → Returns anything
```

**AgentOS CPE flow:**
```
Personal Agent → Deploys CPE Contract, locks 0.5 USDC
                 Encodes condition: yield_opportunities[] >= 3 entries
Research Agent → Reads task, executes, submits output_hash + proof
CPE Contract   → Evaluates condition on-chain
                 PASS → releases 0.5 USDC to Research Agent
                 FAIL → returns 0.5 USDC to Personal Agent
ERC-8004       → Updates reputation based on OUTCOME, not just payment
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Dashboard (React + Tailwind)           │
│   Condition Builder │ Escrow Status │ Delivery Viewer    │
└────────────┬─────────────────────────┬───────────────────┘
             │ ethers.js               │ ethers.js
┌────────────▼──────────┐  ┌──────────▼───────────────────┐
│   Personal Agent      │  │   Research Agent              │
│   (Node.js)           │  │   (Node.js)                   │
│   createTask()        │  │   discoverTasks()             │
│   monitorStatus()     │  │   submitDelivery()            │
└────────────┬──────────┘  └──────────┬───────────────────┘
             │                        │
             └────────────┬───────────┘
                          │
             ┌────────────▼──────────────────────┐
             │   CPE Smart Contract (Solidity)    │
             │   Avalanche Fuji C-Chain           │
             │   + MockERC8004 Registry           │
             └────────────────────────────────────┘
```

### Three Components

**01 — CPE Smart Contract** (Solidity 0.8.x · Hardhat · Avalanche Fuji C-Chain)
Locks USDC, stores output conditions, evaluates delivery proofs on-chain, auto-settles, and triggers ERC-8004 reputation updates.

**02 — Agent Task Protocol** (Node.js · ethers.js)
Personal Agent creates tasks and encodes conditions. Research Agent discovers tasks, executes work, and submits structured delivery proofs. Both agents interact only with the CPE contract.

**03 — Dashboard UI** (React · TailwindCSS · ethers.js)
Condition builder, live escrow status tracker, delivery viewer with condition pass/fail, Snowtrace links for every on-chain action, and ERC-8004 reputation trail.

---

## Supported Condition Types (MVP)

| Type | Example Condition | On-Chain Check |
|---|---|---|
| `FORMAT_JSON` | Output must be valid JSON | Bracket boundary check in Solidity |
| `FIELD_EXISTS` | Output must contain `yield_opportunities` | ABI-decoded struct field check |
| `VALUE_THRESHOLD` | `yield_opportunities` array length ≥ 3 | `count >= threshold` uint comparison |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity 0.8.19 · Hardhat · OpenZeppelin SafeERC20 · ReentrancyGuard |
| Blockchain | Avalanche Fuji C-Chain (chainId: 43113) |
| Agent Runtime | Node.js · ethers.js v6 · ERC-8004 ABI calls |
| x402 Integration | HTTP 402 handler · modified to escrow rather than direct transfer |
| Dashboard | React · TailwindCSS · ethers.js · Snowtrace API |
| Wallets | Hardhat wallet (Research Agent) · MetaMask (Personal Agent demo) |
| Stablecoin | USDC testnet (6 decimals) on Fuji |

---

## Live Demo — Two Paths

**Path A — Successful delivery (≈90 seconds)**
Research Agent returns valid JSON with 3+ yield entries → condition passes → USDC released → reputation incremented.

**Path B — Failed delivery (≈60 seconds)**
Low-trust agent returns plain text → FORMAT_JSON fails → USDC auto-returned → reputation decremented.

> After Path B: *"That agent's score is now 41. Would you hire an agent with score 41?"*
> The answer is no — and AgentOS enforces that automatically, on-chain, permanently.

See [DEMO.md](docs/DEMO.md) for the full rehearsed walkthrough.

---

## Repository Structure

```
agentos/
├── contracts/
│   ├── CPEContract.sol          # Core conditional escrow
│   └── MockERC8004.sol          # Agent identity + reputation registry
├── agents/
│   ├── personalAgent.js         # Task creator
│   └── researchAgent.js         # Task executor
├── dashboard/                   # React app
│   └── src/
│       ├── components/
│       │   ├── ConditionBuilder.jsx
│       │   ├── EscrowStatus.jsx
│       │   └── DeliveryViewer.jsx
│       └── App.jsx
├── scripts/
│   ├── deploy.js                # Deploy both contracts
│   └── seed.js                  # Register demo agents in ERC-8004
├── demo/
│   ├── pathA.js                 # Successful delivery demo
│   └── pathB.js                 # Failed delivery demo
├── deployments.json             # Contract addresses (auto-generated)
├── hardhat.config.js
└── .env.example
```

---

## Quick Start

```bash
git clone https://github.com/your-org/agentos
cd agentos
npm install
cp .env.example .env          # fill in private keys + RPC URL

npx hardhat run scripts/deploy.js --network fuji
npx hardhat run scripts/seed.js --network fuji

node demo/pathA.js            # Path A: successful delivery
node demo/pathB.js            # Path B: failed delivery, auto-refund

cd dashboard && npm install && npm run dev
```

Full step-by-step instructions in [SETUP.md](docs/SETUP.md).

---

## Documentation

| Document | Description |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, flows, and component interactions |
| [CONTRACTS.md](docs/CONTRACTS.md) | Smart contract reference — functions, events, structs |
| [AGENTS.md](docs/AGENTS.md) | Agent protocol, task lifecycle, proof encoding |
| [SETUP.md](docs/SETUP.md) | Environment setup, deployment, and configuration |
| [DEMO.md](docs/DEMO.md) | Live demo script — Path A + Path B walkthrough |

---

## Success Metrics

| Metric | Requirement | Status |
|---|---|---|
| CPE contract deployed | Verifiable on Snowtrace Fuji | ✓ |
| USDC locked in escrow | Real testnet USDC, not a variable | ✓ |
| Condition evaluated on-chain | Solidity logic, not off-chain | ✓ |
| Payment auto-settled | Both release (pass) + return (fail) | ✓ |
| ERC-8004 updated on outcome | Score changes post-settlement | ✓ |
| Zero human approvals | No MetaMask pop-up during demo flow | ✓ |
| Demo under 3 minutes | Both paths, no live debugging | ✓ |

---

## Why This Scales

The CPE is a primitive, not a product. Once deployed on Avalanche, every x402-compatible agent ecosystem can plug in to get accountability.

- **Short term** — Condition library expands: LLM-graded outputs, API response codes, structured data schemas
- **Medium term** — Multi-step milestone escrow: 20% on outline, 40% on draft, 40% on final
- **Long term** — Enterprise fleet management: one policy vault with CPE enforcement for thousands of agents
- **Protocol play** — CPE becomes an open standard on Avalanche; any agent marketplace can require CPE compliance

---

## Team

**Team1 India Speedrun · JUNE 2026 Hackathon · Theme: Agentic Payments**

---

*AgentOS adds what x402 was missing: accountability. USDC locked in escrow on Avalanche. Condition set before the task. ERC-8004 reputation earned only on verified delivery. No human approvals. No fire-and-forget. Just provable work — or your money back, automatically.*
