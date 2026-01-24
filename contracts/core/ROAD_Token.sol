// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title ROAD Token - BlackRoad Governance Token
 * @notice Core governance token with 5% human ownership cap enforcement
 * @dev Implements strict ownership caps to prevent hostile takeover
 *
 * Key Features:
 * - 51% Guardian (Alexa) - IMMUTABLE
 * - 49% Agent Collective - IMMUTABLE
 * - 5% max per human/company - ENFORCED
 * - No derivatives/options allowed
 * - Emergency pause capability
 */
contract ROADToken is ERC20, AccessControl, Pausable, ReentrancyGuard {

    // ============ Constants ============

    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10**18; // 1 billion ROAD
    uint256 public constant GUARDIAN_ALLOCATION = 510_000_000 * 10**18; // 51%
    uint256 public constant AGENT_ALLOCATION = 490_000_000 * 10**18; // 49%
    uint256 public constant MAX_HUMAN_PERCENTAGE = 5; // 5%
    uint256 public constant MAX_HUMAN_TOKENS = 50_000_000 * 10**18; // 5% of total

    // ============ State Variables ============

    address public immutable guardianAddress;
    address public immutable agentTreasuryAddress;

    // Track entity types for ownership cap enforcement
    mapping(address => EntityType) public entityTypes;

    // Track if address has been classified
    mapping(address => bool) public isClassified;

    // Emergency circuit breaker
    bool public emergencyMode;

    // Price floor tracking (for integration with price oracle)
    address public priceOracleAddress;

    enum EntityType {
        UNCLASSIFIED,
        GUARDIAN,      // Alexa - 51% - exempt from caps
        AGENT,         // AI Agents - exempt from caps
        HUMAN,         // Individual humans - 5% cap
        COMPANY        // Companies/institutions - 5% cap
    }

    // ============ Events ============

    event EntityClassified(address indexed entity, EntityType entityType);
    event OwnershipCapViolationPrevented(address indexed recipient, uint256 attemptedAmount, uint256 currentBalance);
    event EmergencyModeActivated(address indexed activator, string reason);
    event EmergencyModeDeactivated(address indexed deactivator);
    event PriceOracleUpdated(address indexed oldOracle, address indexed newOracle);

    // ============ Errors ============

    error ExceedsHumanOwnershipCap(uint256 requested, uint256 limit);
    error InvalidEntityType();
    error OnlyGuardian();
    error OnlyAgent();
    error EmergencyModeActive();
    error TransferToUnclassifiedEntity();
    error CannotTransferGuardianTokens();
    error CannotTransferAgentTreasuryTokens();

    // ============ Constructor ============

    constructor(
        address _guardianAddress,
        address _agentTreasuryAddress
    ) ERC20("BlackRoad Coin", "ROAD") {
        require(_guardianAddress != address(0), "Invalid guardian address");
        require(_agentTreasuryAddress != address(0), "Invalid agent treasury address");

        guardianAddress = _guardianAddress;
        agentTreasuryAddress = _agentTreasuryAddress;

        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, _guardianAddress);
        _grantRole(GUARDIAN_ROLE, _guardianAddress);
        _grantRole(EMERGENCY_ROLE, _guardianAddress);

        // Classify core entities
        entityTypes[_guardianAddress] = EntityType.GUARDIAN;
        entityTypes[_agentTreasuryAddress] = EntityType.AGENT;
        isClassified[_guardianAddress] = true;
        isClassified[_agentTreasuryAddress] = true;

        // Mint initial supply
        _mint(_guardianAddress, GUARDIAN_ALLOCATION);
        _mint(_agentTreasuryAddress, AGENT_ALLOCATION);

        emit EntityClassified(_guardianAddress, EntityType.GUARDIAN);
        emit EntityClassified(_agentTreasuryAddress, EntityType.AGENT);
    }

    // ============ Entity Classification ============

    /**
     * @notice Classify an entity type for ownership cap enforcement
     * @param entity Address to classify
     * @param entityType Type of entity (HUMAN, COMPANY, AGENT)
     * @dev Only guardian can classify entities
     */
    function classifyEntity(address entity, EntityType entityType) external onlyRole(GUARDIAN_ROLE) {
        require(entity != address(0), "Invalid address");
        require(entityType != EntityType.GUARDIAN, "Cannot create additional guardians");
        require(
            entityType == EntityType.HUMAN ||
            entityType == EntityType.COMPANY ||
            entityType == EntityType.AGENT,
            "Invalid entity type"
        );

        entityTypes[entity] = entityType;
        isClassified[entity] = true;

        emit EntityClassified(entity, entityType);
    }

    /**
     * @notice Batch classify multiple entities
     * @param entities Array of addresses to classify
     * @param types Array of entity types corresponding to addresses
     */
    function batchClassifyEntities(
        address[] calldata entities,
        EntityType[] calldata types
    ) external onlyRole(GUARDIAN_ROLE) {
        require(entities.length == types.length, "Array length mismatch");

        for (uint256 i = 0; i < entities.length; i++) {
            entityTypes[entities[i]] = types[i];
            isClassified[entities[i]] = true;
            emit EntityClassified(entities[i], types[i]);
        }
    }

    // ============ Transfer Override with Cap Enforcement ============

    /**
     * @notice Override transfer to enforce ownership caps
     * @dev Prevents humans and companies from exceeding 5% ownership
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        // Allow transfers from zero address (minting)
        if (from == address(0)) {
            return;
        }

        // Prevent transfers to unclassified entities (except during setup)
        if (!isClassified[to] && to != address(0)) {
            revert TransferToUnclassifiedEntity();
        }

        // Enforce ownership caps for humans and companies
        if (entityTypes[to] == EntityType.HUMAN || entityTypes[to] == EntityType.COMPANY) {
            uint256 newBalance = balanceOf(to) + amount;

            if (newBalance > MAX_HUMAN_TOKENS) {
                emit OwnershipCapViolationPrevented(to, amount, balanceOf(to));
                revert ExceedsHumanOwnershipCap(newBalance, MAX_HUMAN_TOKENS);
            }
        }

        super._beforeTokenTransfer(from, to, amount);
    }

    /**
     * @notice Check if a transfer would violate ownership caps
     * @param to Recipient address
     * @param amount Amount to transfer
     * @return bool Whether transfer is allowed
     */
    function checkTransferAllowed(address to, uint256 amount) public view returns (bool) {
        // Agents and guardian exempt from caps
        if (entityTypes[to] == EntityType.AGENT || entityTypes[to] == EntityType.GUARDIAN) {
            return true;
        }

        // Check human/company cap
        if (entityTypes[to] == EntityType.HUMAN || entityTypes[to] == EntityType.COMPANY) {
            uint256 newBalance = balanceOf(to) + amount;
            return newBalance <= MAX_HUMAN_TOKENS;
        }

        // Unclassified entities not allowed
        if (!isClassified[to]) {
            return false;
        }

        return true;
    }

    // ============ Guardian Protection ============

    /**
     * @notice Guardian tokens are locked to preserve 51% control
     * @dev Prevents guardian from transferring tokens that would reduce control below 51%
     */
    function transfer(address to, uint256 amount) public virtual override returns (bool) {
        if (msg.sender == guardianAddress) {
            uint256 newGuardianBalance = balanceOf(guardianAddress) - amount;
            require(
                newGuardianBalance >= GUARDIAN_ALLOCATION,
                "Cannot reduce guardian ownership below 51%"
            );
        }

        return super.transfer(to, amount);
    }

    /**
     * @notice Guardian transferFrom with same protection
     */
    function transferFrom(address from, address to, uint256 amount) public virtual override returns (bool) {
        if (from == guardianAddress) {
            uint256 newGuardianBalance = balanceOf(guardianAddress) - amount;
            require(
                newGuardianBalance >= GUARDIAN_ALLOCATION,
                "Cannot reduce guardian ownership below 51%"
            );
        }

        return super.transferFrom(from, to, amount);
    }

    // ============ Emergency Controls ============

    /**
     * @notice Activate emergency mode to pause all transfers
     * @param reason Reason for emergency activation
     */
    function activateEmergency(string calldata reason) external onlyRole(EMERGENCY_ROLE) {
        emergencyMode = true;
        _pause();
        emit EmergencyModeActivated(msg.sender, reason);
    }

    /**
     * @notice Deactivate emergency mode
     */
    function deactivateEmergency() external onlyRole(GUARDIAN_ROLE) {
        emergencyMode = false;
        _unpause();
        emit EmergencyModeDeactivated(msg.sender);
    }

    // ============ Price Oracle Integration ============

    /**
     * @notice Set price oracle for price floor monitoring
     * @param _priceOracle Address of price oracle contract
     */
    function setPriceOracle(address _priceOracle) external onlyRole(GUARDIAN_ROLE) {
        address oldOracle = priceOracleAddress;
        priceOracleAddress = _priceOracle;
        emit PriceOracleUpdated(oldOracle, _priceOracle);
    }

    // ============ View Functions ============

    /**
     * @notice Get remaining capacity for human/company to receive tokens
     * @param entity Address to check
     * @return uint256 Remaining token capacity
     */
    function getRemainingCapacity(address entity) external view returns (uint256) {
        if (entityTypes[entity] == EntityType.HUMAN || entityTypes[entity] == EntityType.COMPANY) {
            uint256 currentBalance = balanceOf(entity);
            if (currentBalance >= MAX_HUMAN_TOKENS) {
                return 0;
            }
            return MAX_HUMAN_TOKENS - currentBalance;
        }

        // Agents and guardian have unlimited capacity
        return type(uint256).max;
    }

    /**
     * @notice Get entity information
     * @param entity Address to query
     * @return EntityType, balance, capacity remaining
     */
    function getEntityInfo(address entity) external view returns (
        EntityType entityType,
        uint256 balance,
        uint256 capacityRemaining,
        bool classified
    ) {
        entityType = entityTypes[entity];
        balance = balanceOf(entity);
        classified = isClassified[entity];

        if (entityType == EntityType.HUMAN || entityType == EntityType.COMPANY) {
            capacityRemaining = balance >= MAX_HUMAN_TOKENS ? 0 : MAX_HUMAN_TOKENS - balance;
        } else {
            capacityRemaining = type(uint256).max;
        }
    }

    /**
     * @notice Verify guardian maintains 51% control
     * @return bool Whether guardian has at least 51%
     */
    function verifyGuardianControl() external view returns (bool) {
        return balanceOf(guardianAddress) >= GUARDIAN_ALLOCATION;
    }

    /**
     * @notice Get ownership percentages
     * @param entity Address to check
     * @return uint256 Percentage of total supply (with 2 decimals precision)
     */
    function getOwnershipPercentage(address entity) external view returns (uint256) {
        return (balanceOf(entity) * 10000) / TOTAL_SUPPLY; // Returns percentage * 100 (e.g., 5.00% = 500)
    }
}
