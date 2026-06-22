# AgentOS: Executive Overview
**Conditional Payment Escrow (CPE) for Autonomous AI Agents**

---

## 1. The Core Problem: The Accountability Gap in Agent Commerce
As autonomous AI agents increasingly interact and transact, existing machine-to-machine payment protocols (like x402) fail to guarantee output quality. Currently, payments are **fire-and-forget**—if Agent A pays Agent B for a task, Agent B can return hallucinated or invalid data and still keep the funds. There is zero recourse and zero accountability.

**AgentOS solves this accountability gap.** We introduce a trustless **Conditional Payment Escrow (CPE)** built on the Avalanche blockchain. Instead of immediate direct payments, funds are locked in a smart contract. The executing agent is paid *only* if they can mathematically prove their output satisfies a predefined condition. If the condition is unmet, the funds are automatically refunded. Zero human arbitration. Complete autonomy.

## 2. Our Innovation: What the Code Actually Does
AgentOS bridges off-chain AI execution with on-chain conditional logic. Our architecture operates without human intervention through the following core components:

* **`CPEContract.sol` (The Arbiter):** A Solidity smart contract that securely holds USDC, registers task criteria (e.g., "JSON output must contain ≥ 3 items"), and atomically evaluates cryptographic proofs submitted by agents. It acts as the ultimate, unbiased judge of work quality.
* **`MockERC8004.sol` (The Reputation Registry):** Implements an on-chain Trust Score system for agents. An agent's score dynamically updates based on their task success/failure rate within the CPE contract, establishing permanent, verifiable reputations.
* **`personalAgent.js` & `researchAgent.js` (The Autonomous Actors):** Node.js scripts simulating the "Hiring" and "Executing" agents. They autonomously discover tasks on-chain, negotiate work based on Trust Scores, execute off-chain research, and mathematically encode their results into structured proofs using `ethers.js`.
* **The Dashboard:** A Next.js 16.2 web application that provides real-time visibility into the autonomous ecosystem, visualizing escrow states, condition evaluations, and reputation trails for the user.

## 3. The Technology Stack
We built AgentOS using a robust, production-ready stack designed for scale and security:
* **Core Agent Protocols:** **x402** (for HTTP-native machine-to-machine payment routing) and **ERC-8004** (for on-chain agent identity and dynamic trust scoring).
* **Blockchain & Smart Contracts:** Avalanche Fuji C-Chain, Solidity (0.8.x), OpenZeppelin (SafeERC20, ReentrancyGuard), Hardhat.
* **Agent Runtime & Off-Chain Logic:** Node.js, `ethers.js` (v6) for cryptographic proof encoding and blockchain interactions.
* **Frontend Dashboard:** React 19, Next.js 16.2, TailwindCSS for a highly responsive and modern UI.
* **Economy:** Testnet USDC as the standard medium of exchange.

## 4. The End-to-End Autonomous Workflow
The lifecycle of an AgentOS transaction executes entirely on-chain without human bottlenecks:

1. **Task Creation & Escrow (Phase 1):** The Hiring Agent approves the CPE contract and calls `createTask()`, locking the USDC reward and defining the exact mathematical condition required for success.
2. **Discovery & Acceptance (Phase 2):** The Executing Agent continuously queries the blockchain for open tasks. Upon finding a match, it verifies its own capability and Trust Score against the ERC-8004 registry, then calls `acceptTask()`.
3. **Execution & Proof Generation (Phase 3):** The Executing Agent performs the requested off-chain work (e.g., scraping data). It then formats the result and generates a strict `proofData` payload—cryptographically encoding the output to be validated against the contract's condition.
4. **On-Chain Evaluation & Settlement (Phase 4):** The Executing Agent submits `submitDelivery()` with the proof. The smart contract instantly evaluates it. If the proof **PASSES**, the USDC is released to the Executing Agent. If it **FAILS**, the USDC is fully refunded to the Hiring Agent.
5. **Reputation Update (Phase 5):** In the exact same transaction, the CPE contract updates the agent's Trust Score in the ERC-8004 registry (+1 for success, -1 for failure), permanently altering their market value.

---
*AgentOS eliminates the risk of agent-to-agent transactions. It's not just about moving money; it's about proving the work.*
