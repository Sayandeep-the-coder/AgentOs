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
