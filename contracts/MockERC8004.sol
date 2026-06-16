// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "./IERC8004.sol";

/**
 * @title MockERC8004
 * @notice Minimal on-chain agent identity + reputation registry
 * @dev Stands in for a full ERC-8004 deployment for the hackathon.
 *      In production, ConditionalPaymentEscrow would interface with a
 *      deployed ERC-8004 standard registry.
 */
contract MockERC8004 is IERC8004 {
    // ── Structs ──────────────────────────────────────────────────────
    struct Agent {
        uint256   trustScore;    // 0–100 reputation score
        bytes32[] capabilities;  // e.g. ["research", "computation"]
        bool      registered;    // must be true to accept tasks
    }

    // ── State ────────────────────────────────────────────────────────
    mapping(address => Agent) private agents;
    address public cpeContract;  // only address allowed to call updateReputation()
    address public owner;        // deployer — used for admin functions

    // ── Events ───────────────────────────────────────────────────────
    event AgentRegistered(address indexed agent, uint256 initialScore);
    event ReputationUpdated(address indexed agent, bool passed, uint256 newScore);
    event CPEContractSet(address indexed cpe);

    // ── Modifiers ────────────────────────────────────────────────────
    modifier onlyCPE() {
        require(msg.sender == cpeContract, "Only CPE contract");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────
    constructor() {
        owner = msg.sender;
    }

    // ── Admin Functions ──────────────────────────────────────────────

    /**
     * @notice One-time setup. Call after deploying CPE.
     * @dev Sets the onlyCPE access control. Cannot be called again after set.
     * @param _cpe The deployed CPE contract address
     */
    function setCPEContract(address _cpe) external onlyOwner {
        require(cpeContract == address(0), "Already set");
        require(_cpe != address(0), "Zero address");
        cpeContract = _cpe;
        emit CPEContractSet(_cpe);
    }

    /**
     * @notice Register an agent with an initial trust score and capabilities
     * @param agent The agent address to register
     * @param initialScore Initial trust score (0-100)
     * @param caps Array of bytes32-encoded capability strings
     */
    function registerAgent(
        address   agent,
        uint256   initialScore,
        bytes32[] calldata caps
    ) external onlyOwner {
        require(!agents[agent].registered, "Already registered");
        require(initialScore <= 100, "Score must be <= 100");
        require(agent != address(0), "Zero address");

        agents[agent].trustScore = initialScore;
        agents[agent].registered = true;

        for (uint256 i = 0; i < caps.length; i++) {
            agents[agent].capabilities.push(caps[i]);
        }

        emit AgentRegistered(agent, initialScore);
    }

    // ── IERC8004 Implementation ──────────────────────────────────────

    /**
     * @notice Update an agent's reputation based on task outcome
     * @dev Called automatically by the CPE contract on every settlement.
     *      Cannot be called by any other address.
     * @param agent The agent whose reputation is being updated
     * @param passed Whether the delivery condition was met
     */
    function updateReputation(address agent, bool passed) external override onlyCPE {
        require(agents[agent].registered, "Agent not registered");

        if (passed) {
            if (agents[agent].trustScore < 100) {
                agents[agent].trustScore += 1;
            }
        } else {
            if (agents[agent].trustScore > 0) {
                agents[agent].trustScore -= 1;
            }
        }

        emit ReputationUpdated(agent, passed, agents[agent].trustScore);
    }

    /**
     * @notice Get an agent's identity and reputation data
     * @param agent The agent address to query
     * @return trustScore Current trust score (0-100)
     * @return capabilities Array of bytes32-encoded capability strings
     * @return registered Whether the agent is registered
     */
    function getAgent(address agent) external view override returns (
        uint256 trustScore,
        bytes32[] memory capabilities,
        bool registered
    ) {
        Agent storage a = agents[agent];
        return (a.trustScore, a.capabilities, a.registered);
    }
}
