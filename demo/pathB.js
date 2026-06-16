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
