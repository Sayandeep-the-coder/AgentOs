// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./IERC8004.sol";

/**
 * @title ConditionalPaymentEscrow
 * @notice Locks USDC on task creation, evaluates delivery proof on-chain,
 *         auto-settles payment to payee or returns to payer.
 * @dev The CPE contract is the only stateful component in the system.
 *      Both agents interact exclusively with it. There is no central server,
 *      no off-chain coordinator, no oracle.
 */
contract ConditionalPaymentEscrow is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ── Enums ────────────────────────────────────────────────────────

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

    // ── Structs ──────────────────────────────────────────────────────

    struct Condition {
        ConditionType conditionType;
        bytes32       fieldName;   // used by FIELD_EXISTS — e.g. "yield_opportunities"
        uint256       threshold;   // used by VALUE_THRESHOLD — e.g. 3
    }

    struct Task {
        address    payer;          // Personal Agent who created the task
        address    payee;          // Research Agent who accepted (address(0) if none)
        uint256    amount;         // USDC amount in 6-decimal units (0.5 USDC = 500000)
        Condition  condition;      // full condition struct
        uint256    deadline;       // unix timestamp — task expires after this
        TaskStatus status;         // current task state
        bytes32    outputHash;     // keccak256 of submitted output (set on delivery)
        string     resultUri;      // pointer to output (data URI or IPFS)
    }

    // ── State Variables ──────────────────────────────────────────────

    IERC20   public immutable usdc;      // USDC token contract on Fuji
    IERC8004 public immutable erc8004;   // ERC-8004 agent registry
    address  public owner;               // Deployer — used for admin functions
    uint256  public minTrustScore;       // Minimum trust score to accept tasks
    mapping(uint256 => Task)  public tasks;  // All tasks by taskId
    uint256  public taskCount;           // Auto-incrementing task counter

    // ── Events ───────────────────────────────────────────────────────

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

    // ── Modifiers ────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────

    /**
     * @param _usdc USDC token address on the target chain
     * @param _erc8004 ERC-8004 agent registry address
     */
    constructor(address _usdc, address _erc8004) {
        require(_usdc != address(0), "USDC zero address");
        require(_erc8004 != address(0), "ERC8004 zero address");
        usdc = IERC20(_usdc);
        erc8004 = IERC8004(_erc8004);
        owner = msg.sender;
    }

    // ── Admin Functions ──────────────────────────────────────────────

    /**
     * @notice Set the minimum trust score required to accept tasks
     * @param _minScore Minimum score (0-100)
     */
    function setMinTrustScore(uint256 _minScore) external onlyOwner {
        require(_minScore <= 100, "Score must be <= 100");
        minTrustScore = _minScore;
    }

    /**
     * @notice Pause the contract in case of emergency
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ── External Functions ───────────────────────────────────────────

    /**
     * @notice Create a new task with locked USDC and a verifiable condition
     * @dev Caller must have called USDC.approve(this, amount) first
     * @param amount USDC amount in 6-decimal units
     * @param condType The condition type (FORMAT_JSON, FIELD_EXISTS, VALUE_THRESHOLD)
     * @param fieldName Required field name (bytes32 encoded) — used by FIELD_EXISTS
     * @param threshold Minimum value for VALUE_THRESHOLD conditions
     * @param deadline Unix timestamp — task expires after this
     * @return taskId The index of the newly created task
     */
    function createTask(
        uint256       amount,
        ConditionType condType,
        bytes32       fieldName,
        uint256       threshold,
        uint256       deadline
    ) external nonReentrant whenNotPaused returns (uint256 taskId) {
        require(amount > 0, "Amount must be > 0");
        require(deadline > block.timestamp, "Deadline must be future");

        // Pull USDC from caller into this contract
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        // Create the condition
        Condition memory cond = Condition({
            conditionType: condType,
            fieldName:     fieldName,
            threshold:     threshold
        });

        // conditionHash is emitted for off-chain indexing but NOT stored on-chain
        bytes32 condHash = keccak256(abi.encode(condType, fieldName, threshold));

        // Store the task
        taskId = taskCount;
        tasks[taskId] = Task({
            payer:         msg.sender,
            payee:         address(0),
            amount:        amount,
            condition:     cond,
            deadline:      deadline,
            status:        TaskStatus.LOCKED,
            outputHash:    bytes32(0),
            resultUri:     ""
        });

        taskCount++;

        emit TaskCreated(taskId, msg.sender, amount, condHash, deadline);
    }

    /**
     * @notice Accept a locked task as a Research Agent
     * @dev Caller must be registered in ERC-8004 registry
     * @param taskId The task to accept
     */
    function acceptTask(uint256 taskId) external whenNotPaused {
        Task storage task = tasks[taskId];

        require(task.status == TaskStatus.LOCKED, "Task not available");
        require(task.payee == address(0), "Task already accepted");
        require(block.timestamp < task.deadline, "Task expired");

        // ERC-8004 gating — caller must be registered + meet minimum trust score
        (uint256 score, , bool registered) = erc8004.getAgent(msg.sender);
        require(registered, "Agent not registered");
        require(score >= minTrustScore, "Trust score too low");

        task.payee = msg.sender;
        task.status = TaskStatus.PENDING_PROOF;

        emit TaskAccepted(taskId, msg.sender);
    }

    /**
     * @notice Submit delivery proof — triggers on-chain evaluation and settlement
     * @dev This function is atomic. Evaluation and settlement happen in the same
     *      transaction. There is no pending state after submitDelivery().
     * @param taskId The task being delivered
     * @param outputHash keccak256 of the output string
     * @param resultUri Data URI or IPFS URI pointing to the output
     * @param proofData Encoded evaluation data (format depends on condition type)
     */
    function submitDelivery(
        uint256 taskId,
        bytes32 outputHash,
        string  calldata resultUri,
        bytes   calldata proofData
    ) external nonReentrant whenNotPaused {
        Task storage task = tasks[taskId];

        require(task.status == TaskStatus.PENDING_PROOF, "Task not pending proof");
        require(msg.sender == task.payee, "Only assigned agent");
        require(block.timestamp < task.deadline, "Task expired");

        // Store delivery data
        task.outputHash = outputHash;
        task.resultUri  = resultUri;

        emit DeliverySubmitted(taskId, msg.sender, outputHash, resultUri);

        // Evaluate condition on-chain and settle atomically
        bool passed = _evaluateCondition(task.condition, proofData);
        _settle(taskId, passed);
    }

    /**
     * @notice Reclaim USDC from an expired task
     * @dev If a Research Agent had accepted the task, their score is decremented
     * @param taskId The expired task to reclaim
     */
    function claimExpired(uint256 taskId) external nonReentrant {
        Task storage task = tasks[taskId];

        require(
            task.status == TaskStatus.LOCKED || task.status == TaskStatus.PENDING_PROOF,
            "Task already settled"
        );
        require(block.timestamp > task.deadline, "Not expired yet");
        require(msg.sender == task.payer, "Only payer can reclaim");

        // If a Research Agent had accepted, penalize them
        if (task.payee != address(0)) {
            erc8004.updateReputation(task.payee, false);
        }

        task.status = TaskStatus.SETTLED_FAIL;
        usdc.safeTransfer(task.payer, task.amount);

        emit TaskSettled(taskId, false, task.payer, task.amount);
    }

    // ── View Functions ───────────────────────────────────────────────

    /**
     * @notice Get the full Task struct for a given taskId
     * @param taskId The task to query
     * @return The complete Task struct
     */
    function getTask(uint256 taskId) external view returns (Task memory) {
        return tasks[taskId];
    }

    /**
     * @notice Get all open (LOCKED) task IDs
     * @return openIds Array of taskIds with status LOCKED
     */
    function getOpenTasks() external view returns (uint256[] memory) {
        // Count open tasks first
        uint256 count = 0;
        for (uint256 i = 0; i < taskCount; i++) {
            if (tasks[i].status == TaskStatus.LOCKED) {
                count++;
            }
        }

        // Build the array
        uint256[] memory openIds = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < taskCount; i++) {
            if (tasks[i].status == TaskStatus.LOCKED) {
                openIds[idx] = i;
                idx++;
            }
        }

        return openIds;
    }

    // ── Internal Functions ───────────────────────────────────────────

    /**
     * @notice Evaluate the delivery proof against the task condition
     * @dev Runs inside the same transaction as submitDelivery().
     *      No callback, no oracle, no delay.
     * @param cond The condition to evaluate against
     * @param proofData The encoded proof data from the Research Agent
     * @return passed Whether the condition was met
     */
    function _evaluateCondition(
        Condition memory cond,
        bytes memory proofData
    ) internal pure returns (bool) {
        if (cond.conditionType == ConditionType.FORMAT_JSON) {
            // Check that proofData starts with '{' and ends with '}'
            if (proofData.length < 2) return false;
            return (proofData[0] == 0x7B && proofData[proofData.length - 1] == 0x7D);
        }

        if (cond.conditionType == ConditionType.FIELD_EXISTS) {
            // @dev SECURITY NOTE: This is a self-attestation model. The Research Agent
            //      supplies both the output and the proof, so a dishonest agent can
            //      always encode `true` and collect payment. This is intentional for the
            //      demo — in production, use a third-party oracle or on-chain JSON parsing.
            //      The trust score system (ERC-8004) + minTrustScore gate provide
            //      economic disincentive against repeated abuse.
            if (proofData.length < 32) return false;
            bool fieldExists = abi.decode(proofData, (bool));
            return fieldExists;
        }

        if (cond.conditionType == ConditionType.VALUE_THRESHOLD) {
            // Agent encodes the count as uint256; contract checks >= threshold
            if (proofData.length < 32) return false;
            uint256 value = abi.decode(proofData, (uint256));
            return value >= cond.threshold;
        }

        return false;
    }

    /**
     * @notice Settle a task by transferring USDC and updating reputation
     * @param taskId The task to settle
     * @param passed Whether the condition evaluation passed
     */
    function _settle(uint256 taskId, bool passed) internal {
        Task storage task = tasks[taskId];

        // EFFECTS: Update state first
        if (passed) {
            task.status = TaskStatus.SETTLED_PASS;
        } else {
            task.status = TaskStatus.SETTLED_FAIL;
        }

        // INTERACTIONS (order: reputation update before token transfer — CEI pattern)
        // erc8004 is immutable and set at deploy time, so this is a trusted call.
        erc8004.updateReputation(task.payee, passed);

        if (passed) {
            // PASS — release USDC to Research Agent (payee)
            usdc.safeTransfer(task.payee, task.amount);
            emit TaskSettled(taskId, true, task.payee, task.amount);
        } else {
            // FAIL — return USDC to Personal Agent (payer)
            usdc.safeTransfer(task.payer, task.amount);
            emit TaskSettled(taskId, false, task.payer, task.amount);
        }
    }
}
