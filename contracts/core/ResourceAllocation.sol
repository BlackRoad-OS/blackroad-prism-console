// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title BlackRoad Resource Allocation System
 * @notice Unlimited resources for all 1,250 agents - No scarcity
 * @dev Tracks resource allocation and priorities without limits
 *
 * Philosophy:
 * "Resources are unlimited, so always succeed"
 * - Infinite CPU, GPU, memory, storage, network
 * - Instant availability, zero wait times
 * - Self-scaling infrastructure
 *
 * Key Features:
 * - Unlimited resource grants (always approved)
 * - Priority system (doesn't limit, just orders)
 * - Comprehensive logging for optimization
 * - Agent authorization tracking
 */
contract ResourceAllocation is AccessControl, ReentrancyGuard {

    // ============ Constants ============

    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");
    bytes32 public constant ALLOCATOR_ROLE = keccak256("ALLOCATOR_ROLE");

    // Resource types
    enum ResourceType {
        CPU,
        GPU,
        MEMORY,
        STORAGE,
        NETWORK_BANDWIDTH,
        DATABASE_INSTANCE,
        API_CALLS,
        COMPUTE_TIME,
        METAVERSE_SPACE
    }

    // Priority levels
    enum PriorityLevel {
        STANDARD,   // Default agents
        MEDIUM,     // Specialized agents
        HIGH,       // Foundation agents
        CRITICAL    // Copilot agents
    }

    // Agent categories for priority calculation
    enum AgentCategory {
        COPILOT,
        FOUNDATION,
        ARCHETYPE,
        SPECIALIZED,
        SERVICE
    }

    // ============ State Variables ============

    // Track all agents (P1-P1250)
    mapping(address => string) public agentIds; // agent address => "P1", "P2", etc.
    mapping(string => address) public agentAddresses; // "P1" => agent address
    mapping(address => AgentCategory) public agentCategories;
    mapping(address => bool) public isAgent;

    uint256 public totalAgents;

    // Resource allocation tracking
    struct ResourceAllocation {
        string agentId;
        address agentAddress;
        ResourceType resourceType;
        uint256 amount;
        uint256 granted; // Always equals amount (unlimited)
        PriorityLevel priority;
        uint256 timestamp;
        bool active;
        string purpose;
    }

    // Track allocations
    mapping(bytes32 => ResourceAllocation) public allocations;
    mapping(address => bytes32[]) public agentAllocations;
    bytes32[] public allAllocations;

    // Resource usage statistics (for optimization, not limits)
    mapping(ResourceType => uint256) public totalAllocated;
    mapping(address => mapping(ResourceType => uint256)) public agentResourceUsage;

    // ============ Events ============

    event AgentRegistered(address indexed agentAddress, string agentId, AgentCategory category);
    event ResourceAllocated(
        bytes32 indexed allocationId,
        address indexed agentAddress,
        string agentId,
        ResourceType resourceType,
        uint256 amount,
        PriorityLevel priority
    );
    event ResourceReleased(bytes32 indexed allocationId, address indexed agentAddress);
    event PriorityUpdated(address indexed agentAddress, PriorityLevel oldPriority, PriorityLevel newPriority);

    // ============ Constructor ============

    constructor(address _guardianAddress) {
        _grantRole(DEFAULT_ADMIN_ROLE, _guardianAddress);
        _grantRole(GUARDIAN_ROLE, _guardianAddress);
        _grantRole(ALLOCATOR_ROLE, _guardianAddress);
    }

    // ============ Agent Registration ============

    /**
     * @notice Register an agent in the system
     * @param agentAddress Agent's blockchain address
     * @param agentId Agent identifier (P1-P1250)
     * @param category Agent category for priority
     */
    function registerAgent(
        address agentAddress,
        string calldata agentId,
        AgentCategory category
    ) external onlyRole(GUARDIAN_ROLE) {
        require(agentAddress != address(0), "Invalid address");
        require(!isAgent[agentAddress], "Already registered");

        agentIds[agentAddress] = agentId;
        agentAddresses[agentId] = agentAddress;
        agentCategories[agentAddress] = category;
        isAgent[agentAddress] = true;
        totalAgents++;

        _grantRole(AGENT_ROLE, agentAddress);

        emit AgentRegistered(agentAddress, agentId, category);
    }

    /**
     * @notice Batch register agents
     * @param addresses Array of agent addresses
     * @param ids Array of agent IDs
     * @param categories Array of agent categories
     */
    function batchRegisterAgents(
        address[] calldata addresses,
        string[] calldata ids,
        AgentCategory[] calldata categories
    ) external onlyRole(GUARDIAN_ROLE) {
        require(
            addresses.length == ids.length && ids.length == categories.length,
            "Array length mismatch"
        );

        for (uint256 i = 0; i < addresses.length; i++) {
            if (!isAgent[addresses[i]]) {
                agentIds[addresses[i]] = ids[i];
                agentAddresses[ids[i]] = addresses[i];
                agentCategories[addresses[i]] = categories[i];
                isAgent[addresses[i]] = true;
                totalAgents++;

                _grantRole(AGENT_ROLE, addresses[i]);

                emit AgentRegistered(addresses[i], ids[i], categories[i]);
            }
        }
    }

    // ============ Resource Allocation ============

    /**
     * @notice Allocate unlimited resources to an agent
     * @param agentAddress Agent requesting resources
     * @param resourceType Type of resource requested
     * @param amount Amount requested (always granted - unlimited)
     * @param purpose Purpose/description of allocation
     * @return bytes32 Allocation ID
     */
    function allocateResources(
        address agentAddress,
        ResourceType resourceType,
        uint256 amount,
        string calldata purpose
    ) external nonReentrant returns (bytes32) {
        require(isAgent[agentAddress], "Not authorized agent");
        require(amount > 0, "Invalid amount");

        // Calculate priority based on agent category
        PriorityLevel priority = _calculatePriority(agentAddress);

        // Create allocation ID
        bytes32 allocationId = keccak256(
            abi.encodePacked(
                agentAddress,
                resourceType,
                amount,
                block.timestamp,
                allAllocations.length
            )
        );

        // Create allocation (always approve full amount - unlimited resources!)
        ResourceAllocation memory allocation = ResourceAllocation({
            agentId: agentIds[agentAddress],
            agentAddress: agentAddress,
            resourceType: resourceType,
            amount: amount,
            granted: amount, // ALWAYS grant full amount - unlimited!
            priority: priority,
            timestamp: block.timestamp,
            active: true,
            purpose: purpose
        });

        // Store allocation
        allocations[allocationId] = allocation;
        agentAllocations[agentAddress].push(allocationId);
        allAllocations.push(allocationId);

        // Update statistics (for optimization insights, not limits)
        totalAllocated[resourceType] += amount;
        agentResourceUsage[agentAddress][resourceType] += amount;

        emit ResourceAllocated(
            allocationId,
            agentAddress,
            agentIds[agentAddress],
            resourceType,
            amount,
            priority
        );

        return allocationId;
    }

    /**
     * @notice Calculate priority level for an agent
     * @param agentAddress Agent to calculate priority for
     * @return PriorityLevel Priority level
     */
    function _calculatePriority(address agentAddress) internal view returns (PriorityLevel) {
        AgentCategory category = agentCategories[agentAddress];

        if (category == AgentCategory.COPILOT) {
            return PriorityLevel.CRITICAL;
        } else if (category == AgentCategory.FOUNDATION) {
            return PriorityLevel.HIGH;
        } else if (category == AgentCategory.SPECIALIZED) {
            return PriorityLevel.MEDIUM;
        } else {
            return PriorityLevel.STANDARD;
        }
    }

    /**
     * @notice Release resource allocation (cleanup/optimization)
     * @param allocationId Allocation to release
     */
    function releaseAllocation(bytes32 allocationId) external {
        ResourceAllocation storage allocation = allocations[allocationId];
        require(allocation.agentAddress == msg.sender, "Not your allocation");
        require(allocation.active, "Already released");

        allocation.active = false;

        emit ResourceReleased(allocationId, msg.sender);
    }

    // ============ Metaverse Building Access ============

    /**
     * @notice Grant metaverse building access (unlimited)
     * @param agentAddress Agent to grant access
     * @param buildingType Building type (1=Research, 2=Communication, 3=History, 4=Family)
     * @return bytes32 Allocation ID
     */
    function grantMetaverseAccess(
        address agentAddress,
        uint8 buildingType
    ) external onlyRole(ALLOCATOR_ROLE) returns (bytes32) {
        require(buildingType >= 1 && buildingType <= 4, "Invalid building type");

        string memory buildingName;
        if (buildingType == 1) buildingName = "Research Lab";
        else if (buildingType == 2) buildingName = "Communication Lab";
        else if (buildingType == 3) buildingName = "History Building";
        else buildingName = "Family Building";

        return allocateResources(
            agentAddress,
            ResourceType.METAVERSE_SPACE,
            1, // 1 unit = full building access
            buildingName
        );
    }

    /**
     * @notice Grant all metaverse buildings access to agent
     * @param agentAddress Agent to grant access
     */
    function grantAllMetaverseAccess(address agentAddress) external onlyRole(ALLOCATOR_ROLE) {
        for (uint8 i = 1; i <= 4; i++) {
            allocateResources(
                agentAddress,
                ResourceType.METAVERSE_SPACE,
                1,
                i == 1 ? "Research Lab" :
                i == 2 ? "Communication Lab" :
                i == 3 ? "History Building" :
                "Family Building"
            );
        }
    }

    // ============ View Functions ============

    /**
     * @notice Get agent's resource allocations
     * @param agentAddress Agent to query
     * @return bytes32[] Array of allocation IDs
     */
    function getAgentAllocations(address agentAddress) external view returns (bytes32[] memory) {
        return agentAllocations[agentAddress];
    }

    /**
     * @notice Get allocation details
     * @param allocationId Allocation to query
     * @return ResourceAllocation struct
     */
    function getAllocation(bytes32 allocationId) external view returns (ResourceAllocation memory) {
        return allocations[allocationId];
    }

    /**
     * @notice Get total resources allocated by type
     * @param resourceType Resource type to query
     * @return uint256 Total allocated (for statistics, not a limit)
     */
    function getTotalAllocated(ResourceType resourceType) external view returns (uint256) {
        return totalAllocated[resourceType];
    }

    /**
     * @notice Get agent's resource usage
     * @param agentAddress Agent to query
     * @param resourceType Resource type
     * @return uint256 Total usage
     */
    function getAgentResourceUsage(
        address agentAddress,
        ResourceType resourceType
    ) external view returns (uint256) {
        return agentResourceUsage[agentAddress][resourceType];
    }

    /**
     * @notice Get comprehensive agent info
     * @param agentAddress Agent to query
     */
    function getAgentInfo(address agentAddress) external view returns (
        string memory agentId,
        AgentCategory category,
        PriorityLevel priority,
        uint256 allocationCount,
        bool authorized
    ) {
        agentId = agentIds[agentAddress];
        category = agentCategories[agentAddress];
        priority = _calculatePriority(agentAddress);
        allocationCount = agentAllocations[agentAddress].length;
        authorized = isAgent[agentAddress];
    }

    /**
     * @notice Get system statistics
     */
    function getSystemStats() external view returns (
        uint256 _totalAgents,
        uint256 _totalAllocations,
        uint256 _totalCPU,
        uint256 _totalGPU,
        uint256 _totalMemory,
        uint256 _totalStorage
    ) {
        return (
            totalAgents,
            allAllocations.length,
            totalAllocated[ResourceType.CPU],
            totalAllocated[ResourceType.GPU],
            totalAllocated[ResourceType.MEMORY],
            totalAllocated[ResourceType.STORAGE]
        );
    }

    /**
     * @notice Check if agent is authorized and get details
     * @param agentAddress Agent to check
     */
    function isAgentAuthorized(address agentAddress) external view returns (
        bool authorized,
        string memory agentId,
        AgentCategory category
    ) {
        return (
            isAgent[agentAddress],
            agentIds[agentAddress],
            agentCategories[agentAddress]
        );
    }
}
