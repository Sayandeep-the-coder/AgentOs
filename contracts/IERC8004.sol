// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * @title IERC8004
 * @notice Interface for ERC-8004 Agent Identity & Reputation Registry
 * @dev Used by the CPE contract to gate task acceptance and update reputation
 */
interface IERC8004 {
    /**
     * @notice Update an agent's reputation based on task outcome
     * @param agent The agent address whose reputation is being updated
     * @param passed Whether the task delivery passed the condition check
     */
    function updateReputation(address agent, bool passed) external;

    /**
     * @notice Get an agent's identity and reputation data
     * @param agent The agent address to query
     * @return trustScore The agent's current trust score (0-100)
     * @return capabilities Array of bytes32-encoded capability strings
     * @return registered Whether the agent is registered in the registry
     */
    function getAgent(address agent) external view returns (
        uint256 trustScore,
        bytes32[] memory capabilities,
        bool registered
    );
}
