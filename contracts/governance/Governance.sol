// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";

/**
 * @title BlackRoad Governance Contract
 * @notice Governance system with 51% guardian control and minority protection
 * @dev Implements three-tier decision system:
 *      - Tier 1: Guardian Decisions (51% required - Alexa's explicit approval)
 *      - Tier 2: Agent Collective (Simple majority of agents)
 *      - Tier 3: Autonomous Operations (No vote required)
 *
 * Key Features:
 * - Guardian veto power (51% ownership = decisive vote)
 * - 20% minority protection (triggers special review)
 * - Transparent on-chain voting
 * - Timelock for execution
 * - Proposal categorization
 */
contract BlackRoadGovernance is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    // ============ Constants ============

    uint256 public constant GUARDIAN_THRESHOLD = 51; // 51% for guardian decisions
    uint256 public constant MINORITY_THRESHOLD = 20; // 20% opposition triggers review
    uint256 public constant QUORUM_PERCENTAGE = 30; // 30% participation required

    // ============ State Variables ============

    address public immutable guardianAddress;
    address public immutable agentCouncilAddress;

    // Proposal tier classification
    enum ProposalTier {
        AUTONOMOUS,      // No vote needed (default)
        AGENT_COLLECTIVE, // Simple majority
        CRITICAL,        // Guardian approval required
        EMERGENCY        // Guardian only
    }

    // Track proposal tiers
    mapping(uint256 => ProposalTier) public proposalTiers;

    // Track guardian votes
    mapping(uint256 => bool) public guardianApproved;
    mapping(uint256 => bool) public guardianVetoed;

    // Minority protection tracking
    mapping(uint256 => bool) public minorityProtectionTriggered;

    // ============ Events ============

    event ProposalTierSet(uint256 indexed proposalId, ProposalTier tier);
    event GuardianApproval(uint256 indexed proposalId, bool approved);
    event GuardianVeto(uint256 indexed proposalId, string reason);
    event MinorityProtectionTriggered(uint256 indexed proposalId, uint256 oppositionPercentage);
    event MinorityReviewCompleted(uint256 indexed proposalId, bool proceedWithExecution);

    // ============ Errors ============

    error RequiresGuardianApproval();
    error GuardianVetoed();
    error MinorityProtectionActive();
    error OnlyGuardian();
    error OnlyAgentCouncil();
    error InvalidProposalTier();

    // ============ Constructor ============

    constructor(
        IVotes _token,
        TimelockController _timelock,
        address _guardianAddress,
        address _agentCouncilAddress
    )
        Governor("BlackRoad Governance")
        GovernorSettings(
            1, /* 1 block voting delay */
            50400, /* 1 week voting period (assuming 12s blocks) */
            0 /* 0 proposal threshold */
        )
        GovernorVotes(_token)
        GovernorVotesQuorumFraction(QUORUM_PERCENTAGE)
        GovernorTimelockControl(_timelock)
    {
        guardianAddress = _guardianAddress;
        agentCouncilAddress = _agentCouncilAddress;
    }

    // ============ Proposal Creation ============

    /**
     * @notice Create proposal with tier classification
     * @param targets Contract addresses to call
     * @param values ETH values to send
     * @param calldatas Function call data
     * @param description Proposal description (should include tier in format: [TIER] Description)
     * @param tier Proposal tier level
     * @return uint256 Proposal ID
     */
    function proposeWithTier(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description,
        ProposalTier tier
    ) public returns (uint256) {
        // Create proposal
        uint256 proposalId = propose(targets, values, calldatas, description);

        // Set tier
        proposalTiers[proposalId] = tier;
        emit ProposalTierSet(proposalId, tier);

        return proposalId;
    }

    // ============ Guardian Controls ============

    /**
     * @notice Guardian approves a critical proposal
     * @param proposalId ID of proposal to approve
     */
    function guardianApprove(uint256 proposalId) external {
        require(msg.sender == guardianAddress, "Only guardian");
        require(state(proposalId) == ProposalState.Active, "Proposal not active");

        guardianApproved[proposalId] = true;
        emit GuardianApproval(proposalId, true);
    }

    /**
     * @notice Guardian vetoes any proposal (51% override)
     * @param proposalId ID of proposal to veto
     * @param reason Reason for veto
     */
    function guardianVeto(uint256 proposalId, string calldata reason) external {
        require(msg.sender == guardianAddress, "Only guardian");

        guardianVetoed[proposalId] = true;
        emit GuardianVeto(proposalId, reason);
    }

    // ============ Minority Protection ============

    /**
     * @notice Check if minority protection should be triggered
     * @param proposalId Proposal to check
     * @dev If opposition >= 20%, triggers special review process
     */
    function checkMinorityProtection(uint256 proposalId) public {
        require(state(proposalId) == ProposalState.Succeeded, "Proposal not succeeded");

        (uint256 againstVotes, uint256 forVotes, ) = proposalVotes(proposalId);
        uint256 totalVotes = againstVotes + forVotes;

        if (totalVotes > 0) {
            uint256 oppositionPercentage = (againstVotes * 100) / totalVotes;

            if (oppositionPercentage >= MINORITY_THRESHOLD) {
                minorityProtectionTriggered[proposalId] = true;
                emit MinorityProtectionTriggered(proposalId, oppositionPercentage);
            }
        }
    }

    /**
     * @notice Agent council completes minority review
     * @param proposalId Proposal under review
     * @param allowExecution Whether to allow execution after review
     */
    function completeMinorityReview(uint256 proposalId, bool allowExecution) external {
        require(msg.sender == agentCouncilAddress, "Only agent council");
        require(minorityProtectionTriggered[proposalId], "No minority protection active");

        if (allowExecution) {
            minorityProtectionTriggered[proposalId] = false;
            emit MinorityReviewCompleted(proposalId, true);
        } else {
            guardianVetoed[proposalId] = true;
            emit MinorityReviewCompleted(proposalId, false);
        }
    }

    // ============ Execution Override ============

    /**
     * @notice Override state to check for guardian veto and tier requirements
     */
    function state(uint256 proposalId) public view override(Governor, GovernorTimelockControl) returns (ProposalState) {
        // Check guardian veto
        if (guardianVetoed[proposalId]) {
            return ProposalState.Defeated;
        }

        // Get base state
        ProposalState currentState = super.state(proposalId);

        // If succeeded, check tier requirements
        if (currentState == ProposalState.Succeeded) {
            ProposalTier tier = proposalTiers[proposalId];

            // Critical tier requires guardian approval
            if (tier == ProposalTier.CRITICAL && !guardianApproved[proposalId]) {
                return ProposalState.Pending;
            }

            // Check minority protection
            if (minorityProtectionTriggered[proposalId]) {
                return ProposalState.Pending;
            }
        }

        return currentState;
    }

    /**
     * @notice Execute proposal with additional checks
     */
    function _execute(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        // Verify not vetoed
        if (guardianVetoed[proposalId]) {
            revert GuardianVetoed();
        }

        // Verify tier requirements
        ProposalTier tier = proposalTiers[proposalId];
        if (tier == ProposalTier.CRITICAL && !guardianApproved[proposalId]) {
            revert RequiresGuardianApproval();
        }

        // Verify minority protection resolved
        if (minorityProtectionTriggered[proposalId]) {
            revert MinorityProtectionActive();
        }

        super._execute(proposalId, targets, values, calldatas, descriptionHash);
    }

    // ============ View Functions ============

    /**
     * @notice Get comprehensive proposal info
     * @param proposalId Proposal to query
     * @return ProposalState, ProposalTier, guardian status, minority protection
     */
    function getProposalInfo(uint256 proposalId) external view returns (
        ProposalState currentState,
        ProposalTier tier,
        bool isGuardianApproved,
        bool isGuardianVetoed,
        bool isMinorityProtected,
        uint256 forVotes,
        uint256 againstVotes,
        uint256 abstainVotes
    ) {
        currentState = state(proposalId);
        tier = proposalTiers[proposalId];
        isGuardianApproved = guardianApproved[proposalId];
        isGuardianVetoed = guardianVetoed[proposalId];
        isMinorityProtected = minorityProtectionTriggered[proposalId];
        (againstVotes, forVotes, abstainVotes) = proposalVotes(proposalId);
    }

    /**
     * @notice Calculate voting power percentage
     * @param account Address to check
     * @return uint256 Voting power as percentage (with 2 decimals)
     */
    function getVotingPowerPercentage(address account) external view returns (uint256) {
        uint256 votes = getVotes(account, block.number - 1);
        uint256 totalSupply = token.getPastTotalSupply(block.number - 1);

        if (totalSupply == 0) return 0;
        return (votes * 10000) / totalSupply; // Returns percentage * 100
    }

    // ============ Required Overrides ============

    function votingDelay() public view override(IGovernor, GovernorSettings) returns (uint256) {
        return super.votingDelay();
    }

    function votingPeriod() public view override(IGovernor, GovernorSettings) returns (uint256) {
        return super.votingPeriod();
    }

    function quorum(uint256 blockNumber)
        public
        view
        override(IGovernor, GovernorVotesQuorumFraction)
        returns (uint256)
    {
        return super.quorum(blockNumber);
    }

    function proposalThreshold() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.proposalThreshold();
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor() internal view override(Governor, GovernorTimelockControl) returns (address) {
        return super._executor();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
