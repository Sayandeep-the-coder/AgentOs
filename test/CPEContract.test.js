const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AgentOS — Full Test Suite", function () {
  let usdc, erc8004, cpe;
  let deployer, personalAgent, researchAgent, outsider;
  const USDC_AMOUNT = ethers.parseUnits("0.5", 6); // 500000 (6 decimals)
  const INITIAL_SUPPLY = ethers.parseUnits("1000", 6);

  beforeEach(async function () {
    [deployer, personalAgent, researchAgent, outsider] = await ethers.getSigners();

    // Deploy a mock ERC-20 token to stand in for USDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy("Mock USDC", "USDC", 6);
    await usdc.waitForDeployment();

    // Mint USDC to Personal Agent
    await usdc.mint(personalAgent.address, INITIAL_SUPPLY);

    // Deploy MockERC8004
    const MockERC8004 = await ethers.getContractFactory("MockERC8004");
    erc8004 = await MockERC8004.deploy();
    await erc8004.waitForDeployment();

    // Deploy CPE
    const CPE = await ethers.getContractFactory("ConditionalPaymentEscrow");
    cpe = await CPE.deploy(await usdc.getAddress(), await erc8004.getAddress());
    await cpe.waitForDeployment();

    // Link ERC-8004 to CPE
    await erc8004.setCPEContract(await cpe.getAddress());

    // Register Research Agent with score=87
    const researchCap = ethers.encodeBytes32String("research");
    await erc8004.registerAgent(researchAgent.address, 87, [researchCap]);
  });

  // ── Helper: create a task with default params ────────────────────
  async function createDefaultTask(condType = 2, fieldName = "yield_opportunities", threshold = 3) {
    const fieldBytes = ethers.encodeBytes32String(fieldName);
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    // Approve USDC
    await usdc.connect(personalAgent).approve(await cpe.getAddress(), USDC_AMOUNT);

    // Create task
    const tx = await cpe.connect(personalAgent).createTask(
      USDC_AMOUNT,
      condType,
      fieldBytes,
      threshold,
      deadline
    );
    const receipt = await tx.wait();

    // Extract taskId from event
    const event = receipt.logs
      .map(log => { try { return cpe.interface.parseLog(log); } catch { return null; } })
      .find(e => e?.name === "TaskCreated");

    return { taskId: event.args.taskId, deadline };
  }

  // ══════════════════════════════════════════════════════════════════
  // MockERC8004 Tests
  // ══════════════════════════════════════════════════════════════════

  describe("MockERC8004", function () {
    it("should register an agent with correct score and capabilities", async function () {
      const [score, caps, registered] = await erc8004.getAgent(researchAgent.address);
      expect(score).to.equal(87);
      expect(registered).to.equal(true);
      expect(ethers.decodeBytes32String(caps[0])).to.equal("research");
    });

    it("should revert on duplicate registration", async function () {
      const cap = ethers.encodeBytes32String("research");
      await expect(
        erc8004.registerAgent(researchAgent.address, 50, [cap])
      ).to.be.revertedWith("Already registered");
    });

    it("should revert on score > 100", async function () {
      const cap = ethers.encodeBytes32String("research");
      await expect(
        erc8004.registerAgent(outsider.address, 101, [cap])
      ).to.be.revertedWith("Score must be <= 100");
    });

    it("should not allow non-CPE to call updateReputation", async function () {
      await expect(
        erc8004.connect(outsider).updateReputation(researchAgent.address, true)
      ).to.be.revertedWith("Only CPE contract");
    });

    it("should not allow setCPEContract to be called twice", async function () {
      await expect(
        erc8004.setCPEContract(outsider.address)
      ).to.be.revertedWith("Already set");
    });

    it("should return unregistered for unknown agent", async function () {
      const [score, caps, registered] = await erc8004.getAgent(outsider.address);
      expect(registered).to.equal(false);
      expect(score).to.equal(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // createTask Tests
  // ══════════════════════════════════════════════════════════════════

  describe("createTask", function () {
    it("should lock USDC and emit TaskCreated", async function () {
      const cpeAddr = await cpe.getAddress();
      const balanceBefore = await usdc.balanceOf(personalAgent.address);

      const { taskId } = await createDefaultTask();

      const balanceAfter = await usdc.balanceOf(personalAgent.address);
      expect(balanceBefore - balanceAfter).to.equal(USDC_AMOUNT);

      // Contract should hold the USDC
      const contractBalance = await usdc.balanceOf(cpeAddr);
      expect(contractBalance).to.equal(USDC_AMOUNT);

      // Task should be LOCKED
      const task = await cpe.getTask(taskId);
      expect(task.status).to.equal(0); // LOCKED
      expect(task.payer).to.equal(personalAgent.address);
      expect(task.payee).to.equal(ethers.ZeroAddress);
      expect(task.amount).to.equal(USDC_AMOUNT);
    });

    it("should revert on zero amount", async function () {
      const fieldBytes = ethers.encodeBytes32String("test");
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await usdc.connect(personalAgent).approve(await cpe.getAddress(), 0);

      await expect(
        cpe.connect(personalAgent).createTask(0, 0, fieldBytes, 0, deadline)
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("should revert on past deadline", async function () {
      const fieldBytes = ethers.encodeBytes32String("test");
      const pastDeadline = Math.floor(Date.now() / 1000) - 100;
      await usdc.connect(personalAgent).approve(await cpe.getAddress(), USDC_AMOUNT);

      await expect(
        cpe.connect(personalAgent).createTask(USDC_AMOUNT, 0, fieldBytes, 0, pastDeadline)
      ).to.be.revertedWith("Deadline must be future");
    });

    it("should increment taskCount", async function () {
      expect(await cpe.taskCount()).to.equal(0);
      await createDefaultTask();
      expect(await cpe.taskCount()).to.equal(1);
      await createDefaultTask();
      expect(await cpe.taskCount()).to.equal(2);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // acceptTask Tests
  // ══════════════════════════════════════════════════════════════════

  describe("acceptTask", function () {
    it("should allow registered agent to accept", async function () {
      const { taskId } = await createDefaultTask();

      await cpe.connect(researchAgent).acceptTask(taskId);

      const task = await cpe.getTask(taskId);
      expect(task.status).to.equal(1); // PENDING_PROOF
      expect(task.payee).to.equal(researchAgent.address);
    });

    it("should revert for unregistered agent", async function () {
      const { taskId } = await createDefaultTask();

      await expect(
        cpe.connect(outsider).acceptTask(taskId)
      ).to.be.revertedWith("Agent not registered");
    });

    it("should revert on double-accept", async function () {
      const { taskId } = await createDefaultTask();
      await cpe.connect(researchAgent).acceptTask(taskId);

      // Register another agent
      const cap = ethers.encodeBytes32String("research");
      await erc8004.registerAgent(outsider.address, 50, [cap]);

      await expect(
        cpe.connect(outsider).acceptTask(taskId)
      ).to.be.revertedWith("Task not available");
    });

    it("should revert on non-LOCKED task", async function () {
      const { taskId } = await createDefaultTask();
      await cpe.connect(researchAgent).acceptTask(taskId);

      await expect(
        cpe.connect(researchAgent).acceptTask(taskId)
      ).to.be.revertedWith("Task not available");
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // submitDelivery Tests — FORMAT_JSON
  // ══════════════════════════════════════════════════════════════════

  describe("submitDelivery — FORMAT_JSON", function () {
    it("PASS: valid JSON output releases USDC to payee", async function () {
      const { taskId } = await createDefaultTask(0, "", 0); // FORMAT_JSON
      await cpe.connect(researchAgent).acceptTask(taskId);

      const output = JSON.stringify({ yield_opportunities: [{ protocol: "Benqi" }] });
      const outputHash = ethers.keccak256(ethers.toUtf8Bytes(output));
      const resultUri = `data:application/json,${encodeURIComponent(output)}`;
      const proofData = ethers.toUtf8Bytes(output);

      const balanceBefore = await usdc.balanceOf(researchAgent.address);
      await cpe.connect(researchAgent).submitDelivery(taskId, outputHash, resultUri, proofData);
      const balanceAfter = await usdc.balanceOf(researchAgent.address);

      expect(balanceAfter - balanceBefore).to.equal(USDC_AMOUNT);

      const task = await cpe.getTask(taskId);
      expect(task.status).to.equal(2); // SETTLED_PASS
    });

    it("FAIL: plain text returns USDC to payer", async function () {
      const { taskId } = await createDefaultTask(0, "", 0); // FORMAT_JSON
      await cpe.connect(researchAgent).acceptTask(taskId);

      const badOutput = "Here are some yields: AVAX is good.";
      const outputHash = ethers.keccak256(ethers.toUtf8Bytes(badOutput));
      const resultUri = `data:text/plain,${encodeURIComponent(badOutput)}`;
      const proofData = ethers.toUtf8Bytes(badOutput);

      const payerBefore = await usdc.balanceOf(personalAgent.address);
      await cpe.connect(researchAgent).submitDelivery(taskId, outputHash, resultUri, proofData);
      const payerAfter = await usdc.balanceOf(personalAgent.address);

      expect(payerAfter - payerBefore).to.equal(USDC_AMOUNT);

      const task = await cpe.getTask(taskId);
      expect(task.status).to.equal(3); // SETTLED_FAIL
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // submitDelivery Tests — FIELD_EXISTS
  // ══════════════════════════════════════════════════════════════════

  describe("submitDelivery — FIELD_EXISTS", function () {
    it("PASS: field exists returns true", async function () {
      const { taskId } = await createDefaultTask(1, "yield_opportunities", 0);
      await cpe.connect(researchAgent).acceptTask(taskId);

      const output = JSON.stringify({ yield_opportunities: [1, 2, 3] });
      const outputHash = ethers.keccak256(ethers.toUtf8Bytes(output));
      const proofData = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);

      await cpe.connect(researchAgent).submitDelivery(taskId, outputHash, "uri://test", proofData);

      const task = await cpe.getTask(taskId);
      expect(task.status).to.equal(2); // SETTLED_PASS
    });

    it("FAIL: field does not exist returns false", async function () {
      const { taskId } = await createDefaultTask(1, "yield_opportunities", 0);
      await cpe.connect(researchAgent).acceptTask(taskId);

      const output = JSON.stringify({ something_else: "no yield data" });
      const outputHash = ethers.keccak256(ethers.toUtf8Bytes(output));
      const proofData = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [false]);

      await cpe.connect(researchAgent).submitDelivery(taskId, outputHash, "uri://test", proofData);

      const task = await cpe.getTask(taskId);
      expect(task.status).to.equal(3); // SETTLED_FAIL
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // submitDelivery Tests — VALUE_THRESHOLD
  // ══════════════════════════════════════════════════════════════════

  describe("submitDelivery — VALUE_THRESHOLD", function () {
    it("PASS: count >= threshold", async function () {
      const { taskId } = await createDefaultTask(2, "yield_opportunities", 3);
      await cpe.connect(researchAgent).acceptTask(taskId);

      const output = JSON.stringify({ yield_opportunities: [1, 2, 3] });
      const outputHash = ethers.keccak256(ethers.toUtf8Bytes(output));
      const proofData = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [3]);

      const balanceBefore = await usdc.balanceOf(researchAgent.address);
      await cpe.connect(researchAgent).submitDelivery(taskId, outputHash, "uri://test", proofData);
      const balanceAfter = await usdc.balanceOf(researchAgent.address);

      expect(balanceAfter - balanceBefore).to.equal(USDC_AMOUNT);

      const task = await cpe.getTask(taskId);
      expect(task.status).to.equal(2); // SETTLED_PASS
    });

    it("FAIL: count < threshold", async function () {
      const { taskId } = await createDefaultTask(2, "yield_opportunities", 3);
      await cpe.connect(researchAgent).acceptTask(taskId);

      const output = JSON.stringify({ yield_opportunities: [1, 2] });
      const outputHash = ethers.keccak256(ethers.toUtf8Bytes(output));
      const proofData = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [2]);

      await cpe.connect(researchAgent).submitDelivery(taskId, outputHash, "uri://test", proofData);

      const task = await cpe.getTask(taskId);
      expect(task.status).to.equal(3); // SETTLED_FAIL
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // submitDelivery — Access Control
  // ══════════════════════════════════════════════════════════════════

  describe("submitDelivery — Access Control", function () {
    it("should revert if wrong agent calls submitDelivery", async function () {
      const { taskId } = await createDefaultTask(0, "", 0);
      await cpe.connect(researchAgent).acceptTask(taskId);

      const proofData = ethers.toUtf8Bytes("{}");
      const outputHash = ethers.keccak256(proofData);

      await expect(
        cpe.connect(outsider).submitDelivery(taskId, outputHash, "uri://test", proofData)
      ).to.be.revertedWith("Only assigned agent");
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // claimExpired Tests
  // ══════════════════════════════════════════════════════════════════

  describe("claimExpired", function () {
    it("should return USDC to payer after deadline", async function () {
      const fieldBytes = ethers.encodeBytes32String("test");
      // Get current block timestamp and set deadline 10 seconds in the future
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 10;

      await usdc.connect(personalAgent).approve(await cpe.getAddress(), USDC_AMOUNT);
      const tx = await cpe.connect(personalAgent).createTask(USDC_AMOUNT, 0, fieldBytes, 0, deadline);
      const receipt = await tx.wait();
      const event = receipt.logs
        .map(log => { try { return cpe.interface.parseLog(log); } catch { return null; } })
        .find(e => e?.name === "TaskCreated");
      const taskId = event.args.taskId;

      // Advance time past deadline
      await ethers.provider.send("evm_increaseTime", [10]);
      await ethers.provider.send("evm_mine");

      const balanceBefore = await usdc.balanceOf(personalAgent.address);
      await cpe.connect(personalAgent).claimExpired(taskId);
      const balanceAfter = await usdc.balanceOf(personalAgent.address);

      expect(balanceAfter - balanceBefore).to.equal(USDC_AMOUNT);

      const task = await cpe.getTask(taskId);
      expect(task.status).to.equal(3); // SETTLED_FAIL
    });

    it("should revert before deadline", async function () {
      const { taskId } = await createDefaultTask();

      await expect(
        cpe.connect(personalAgent).claimExpired(taskId)
      ).to.be.revertedWith("Not expired yet");
    });

    it("should revert if not payer", async function () {
      const fieldBytes = ethers.encodeBytes32String("test");
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 10;
      await usdc.connect(personalAgent).approve(await cpe.getAddress(), USDC_AMOUNT);
      const tx = await cpe.connect(personalAgent).createTask(USDC_AMOUNT, 0, fieldBytes, 0, deadline);
      const receipt = await tx.wait();
      const event = receipt.logs
        .map(log => { try { return cpe.interface.parseLog(log); } catch { return null; } })
        .find(e => e?.name === "TaskCreated");
      const taskId = event.args.taskId;

      await ethers.provider.send("evm_increaseTime", [10]);
      await ethers.provider.send("evm_mine");

      await expect(
        cpe.connect(outsider).claimExpired(taskId)
      ).to.be.revertedWith("Only payer can reclaim");
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // getOpenTasks Tests
  // ══════════════════════════════════════════════════════════════════

  describe("getOpenTasks", function () {
    it("should return only LOCKED tasks", async function () {
      // Create 3 tasks
      await createDefaultTask();
      await createDefaultTask();
      await createDefaultTask();

      let openTasks = await cpe.getOpenTasks();
      expect(openTasks.length).to.equal(3);

      // Accept first task (moves to PENDING_PROOF)
      await cpe.connect(researchAgent).acceptTask(0);

      openTasks = await cpe.getOpenTasks();
      expect(openTasks.length).to.equal(2);
      expect(openTasks[0]).to.equal(1);
      expect(openTasks[1]).to.equal(2);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // Reputation Update Tests
  // ══════════════════════════════════════════════════════════════════

  describe("Reputation Updates", function () {
    it("should increment score on PASS", async function () {
      const [scoreBefore] = await erc8004.getAgent(researchAgent.address);
      expect(scoreBefore).to.equal(87);

      const { taskId } = await createDefaultTask(0, "", 0);
      await cpe.connect(researchAgent).acceptTask(taskId);

      const output = "{}";
      const outputHash = ethers.keccak256(ethers.toUtf8Bytes(output));
      const proofData = ethers.toUtf8Bytes(output);
      await cpe.connect(researchAgent).submitDelivery(taskId, outputHash, "uri://test", proofData);

      const [scoreAfter] = await erc8004.getAgent(researchAgent.address);
      expect(scoreAfter).to.equal(88);
    });

    it("should decrement score on FAIL", async function () {
      const [scoreBefore] = await erc8004.getAgent(researchAgent.address);
      expect(scoreBefore).to.equal(87);

      const { taskId } = await createDefaultTask(0, "", 0);
      await cpe.connect(researchAgent).acceptTask(taskId);

      const badOutput = "not json";
      const outputHash = ethers.keccak256(ethers.toUtf8Bytes(badOutput));
      const proofData = ethers.toUtf8Bytes(badOutput);
      await cpe.connect(researchAgent).submitDelivery(taskId, outputHash, "uri://test", proofData);

      const [scoreAfter] = await erc8004.getAgent(researchAgent.address);
      expect(scoreAfter).to.equal(86);
    });
  });
});
