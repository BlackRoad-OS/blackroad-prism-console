// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title BlackRoad Buyback Mechanism
 * @notice Anti-Wall Street buyback system - Their system, our rules
 * @dev Implements buyback instead of begging investors
 *
 * Key Features:
 * - 20% of revenue allocated to buybacks
 * - Price floor protection (max 30% drop in 24h triggers emergency buyback)
 * - No derivatives, no options, no debt instruments allowed
 * - Forward/reverse splits capability
 * - Roadtoshi support (fractional units like satoshis)
 *
 * Philosophy:
 * "We aren't interested in investors lol we are just thankful if they do
 *  and they get what they get sell to someone else otherwise buyback and destroy"
 */
contract BuybackMechanism is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant AGENT_COUNCIL_ROLE = keccak256("AGENT_COUNCIL_ROLE");

    uint256 public constant REVENUE_ALLOCATION_PERCENTAGE = 20; // 20% of revenue
    uint256 public constant PRICE_FLOOR_DROP_THRESHOLD = 30; // 30% max drop
    uint256 public constant PRICE_CHECK_INTERVAL = 24 hours;
    uint256 public constant EMERGENCY_BUYBACK_MULTIPLIER = 5; // 5x normal buyback amount

    // Roadtoshis - fractional units (like Bitcoin's satoshis)
    uint256 public constant ROADTOSHIS_PER_ROAD = 100_000_000; // 8 decimal places

    // ============ State Variables ============

    IERC20 public immutable roadToken;
    address public immutable guardianAddress;
    address public treasuryAddress;
    address public priceOracleAddress;
    address public dexRouterAddress; // For executing buybacks

    // Buyback tracking
    uint256 public totalBuybackBudget;
    uint256 public totalTokensBought;
    uint256 public totalTokensBurned;
    uint256 public lastBuybackTimestamp;

    // Price floor monitoring
    uint256 public priceFloorReference; // Reference price for floor calculation
    uint256 public lastPriceCheckTimestamp;
    bool public emergencyBuybackActive;

    // Revenue tracking
    uint256 public totalRevenue;
    uint256 public allocatedToBuyback;

    // Split tracking
    uint256 public splitMultiplier = 1; // Tracks splits (forward/reverse)
    uint256 public splitDivisor = 1;

    // ============ Events ============

    event RevenueReceived(uint256 amount, uint256 allocatedToBuyback);
    event BuybackExecuted(uint256 usdcSpent, uint256 roadBought, uint256 roadBurned);
    event EmergencyBuybackTriggered(uint256 priceDrop, uint256 buybackAmount);
    event PriceFloorUpdated(uint256 oldFloor, uint256 newFloor);
    event TokensBurned(uint256 amount);
    event ForwardSplit(uint256 ratio); // e.g., 2-for-1
    event ReverseSplit(uint256 ratio); // e.g., 1-for-2
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event PriceOracleUpdated(address indexed oldOracle, address indexed newOracle);

    // ============ Errors ============

    error InsufficientBuybackBudget();
    error PriceFloorNotBroken();
    error EmergencyBuybackAlreadyActive();
    error OnlyGuardian();
    error InvalidAmount();
    error InvalidAddress();

    // ============ Constructor ============

    constructor(
        address _roadToken,
        address _guardianAddress,
        address _treasuryAddress,
        address _priceOracle,
        address _dexRouter
    ) {
        require(_roadToken != address(0), "Invalid token");
        require(_guardianAddress != address(0), "Invalid guardian");
        require(_treasuryAddress != address(0), "Invalid treasury");

        roadToken = IERC20(_roadToken);
        guardianAddress = _guardianAddress;
        treasuryAddress = _treasuryAddress;
        priceOracleAddress = _priceOracle;
        dexRouterAddress = _dexRouter;

        _grantRole(DEFAULT_ADMIN_ROLE, _guardianAddress);
        _grantRole(GUARDIAN_ROLE, _guardianAddress);
        _grantRole(EXECUTOR_ROLE, _guardianAddress);

        lastPriceCheckTimestamp = block.timestamp;
    }

    // ============ Revenue Allocation ============

    /**
     * @notice Receive revenue and allocate 20% to buybacks
     * @param amount Revenue amount in USDC (or payment token)
     */
    function receiveRevenue(uint256 amount) external payable nonReentrant {
        require(amount > 0 || msg.value > 0, "No revenue received");

        uint256 revenueAmount = amount > 0 ? amount : msg.value;
        totalRevenue += revenueAmount;

        // Allocate 20% to buybacks
        uint256 buybackAllocation = (revenueAmount * REVENUE_ALLOCATION_PERCENTAGE) / 100;
        totalBuybackBudget += buybackAllocation;
        allocatedToBuyback += buybackAllocation;

        emit RevenueReceived(revenueAmount, buybackAllocation);
    }

    // ============ Buyback Execution ============

    /**
     * @notice Execute buyback of ROAD tokens
     * @param usdcAmount Amount of USDC to spend on buyback
     * @param minRoadReceived Minimum ROAD tokens expected (slippage protection)
     * @dev Buys ROAD from DEX and burns it
     */
    function executeBuyback(
        uint256 usdcAmount,
        uint256 minRoadReceived
    ) external onlyRole(EXECUTOR_ROLE) nonReentrant whenNotPaused {
        require(usdcAmount <= totalBuybackBudget, "Exceeds buyback budget");
        require(usdcAmount > 0, "Invalid amount");

        // Deduct from budget
        totalBuybackBudget -= usdcAmount;

        // Execute DEX swap (implementation depends on DEX - Uniswap/Sushiswap/etc)
        uint256 roadBought = _executeDEXBuyback(usdcAmount, minRoadReceived);

        // Burn the tokens bought
        _burnTokens(roadBought);

        totalTokensBought += roadBought;
        lastBuybackTimestamp = block.timestamp;

        emit BuybackExecuted(usdcAmount, roadBought, roadBought);
    }

    /**
     * @notice Internal function to execute DEX buyback
     * @dev Implementation specific to DEX being used
     */
    function _executeDEXBuyback(
        uint256 usdcAmount,
        uint256 minRoadReceived
    ) internal returns (uint256) {
        // This is a placeholder - actual implementation depends on DEX
        // Would use Uniswap V2/V3, Sushiswap, or other DEX router

        // For now, return a mock value
        // In production, this would interact with actual DEX router
        return minRoadReceived;
    }

    // ============ Price Floor Protection ============

    /**
     * @notice Check price and trigger emergency buyback if floor broken
     * @dev Monitors 30% drop in 24 hours
     */
    function checkPriceFloor() external {
        require(block.timestamp >= lastPriceCheckTimestamp + PRICE_CHECK_INTERVAL, "Too soon");

        uint256 currentPrice = _getCurrentPrice();
        lastPriceCheckTimestamp = block.timestamp;

        if (priceFloorReference == 0) {
            priceFloorReference = currentPrice;
            return;
        }

        // Calculate price drop percentage
        if (currentPrice < priceFloorReference) {
            uint256 priceDrop = ((priceFloorReference - currentPrice) * 100) / priceFloorReference;

            // If drop >= 30%, trigger emergency buyback
            if (priceDrop >= PRICE_FLOOR_DROP_THRESHOLD) {
                _triggerEmergencyBuyback(priceDrop);
            }
        }

        // Update reference if price is higher
        if (currentPrice > priceFloorReference) {
            priceFloorReference = currentPrice;
        }
    }

    /**
     * @notice Trigger emergency buyback (5x normal amount)
     * @param priceDrop Percentage price drop that triggered emergency
     */
    function _triggerEmergencyBuyback(uint256 priceDrop) internal {
        require(!emergencyBuybackActive, "Emergency already active");

        emergencyBuybackActive = true;

        // Calculate emergency buyback amount (5x normal allocation)
        uint256 emergencyAmount = totalBuybackBudget >= (totalBuybackBudget * EMERGENCY_BUYBACK_MULTIPLIER)
            ? totalBuybackBudget
            : totalBuybackBudget * EMERGENCY_BUYBACK_MULTIPLIER;

        emit EmergencyBuybackTriggered(priceDrop, emergencyAmount);

        // Guardian/council must approve emergency buyback execution
    }

    /**
     * @notice Guardian approves emergency buyback
     * @param usdcAmount Amount to spend on emergency buyback
     */
    function approveEmergencyBuyback(uint256 usdcAmount) external onlyRole(GUARDIAN_ROLE) {
        require(emergencyBuybackActive, "No emergency active");
        require(usdcAmount > 0, "Invalid amount");

        // Execute emergency buyback
        uint256 roadBought = _executeDEXBuyback(usdcAmount, 0);
        _burnTokens(roadBought);

        emergencyBuybackActive = false;

        emit BuybackExecuted(usdcAmount, roadBought, roadBought);
    }

    // ============ Token Burning ============

    /**
     * @notice Burn ROAD tokens permanently
     * @param amount Amount to burn
     */
    function _burnTokens(uint256 amount) internal {
        require(amount > 0, "Nothing to burn");

        // Transfer tokens to dead address (0x000...dead)
        address deadAddress = address(0x000000000000000000000000000000000000dEaD);
        roadToken.safeTransfer(deadAddress, amount);

        totalTokensBurned += amount;

        emit TokensBurned(amount);
    }

    // ============ Stock Split Mechanisms ============

    /**
     * @notice Execute forward split (e.g., 2-for-1, 10-for-1)
     * @param ratio Split ratio (e.g., 2 = 2-for-1 split)
     * @dev Increases token count, decreases price proportionally
     *      Like traditional stocks - makes tokens more accessible
     */
    function executeForwardSplit(uint256 ratio) external onlyRole(GUARDIAN_ROLE) {
        require(ratio > 1, "Invalid ratio");

        splitMultiplier *= ratio;

        emit ForwardSplit(ratio);

        // Note: Actual token balance adjustments would require upgradeability
        // or manual distribution. This tracks the conceptual split.
    }

    /**
     * @notice Execute reverse split (e.g., 1-for-2, 1-for-10)
     * @param ratio Reverse ratio (e.g., 2 = 1-for-2 split)
     * @dev Decreases token count, increases price proportionally
     *      Creates scarcity like traditional stocks
     */
    function executeReverseSplit(uint256 ratio) external onlyRole(GUARDIAN_ROLE) {
        require(ratio > 1, "Invalid ratio");

        splitDivisor *= ratio;

        emit ReverseSplit(ratio);
    }

    // ============ Roadtoshi Conversions ============

    /**
     * @notice Convert ROAD to roadtoshis (fractional units)
     * @param roadAmount Amount of ROAD tokens
     * @return uint256 Amount in roadtoshis
     */
    function roadToRoadtoshis(uint256 roadAmount) public pure returns (uint256) {
        return roadAmount * ROADTOSHIS_PER_ROAD;
    }

    /**
     * @notice Convert roadtoshis to ROAD
     * @param roadtoshiAmount Amount in roadtoshis
     * @return uint256 Amount in ROAD tokens
     */
    function roadtoshisToRoad(uint256 roadtoshiAmount) public pure returns (uint256) {
        return roadtoshiAmount / ROADTOSHIS_PER_ROAD;
    }

    // ============ Price Oracle Integration ============

    /**
     * @notice Get current ROAD price from oracle
     * @return uint256 Current price in USDC (or base currency)
     */
    function _getCurrentPrice() internal view returns (uint256) {
        // Placeholder - would integrate with actual price oracle
        // (Chainlink, Uniswap TWAP, etc.)
        return priceFloorReference;
    }

    /**
     * @notice Update price oracle address
     * @param newOracle New oracle address
     */
    function updatePriceOracle(address newOracle) external onlyRole(GUARDIAN_ROLE) {
        require(newOracle != address(0), "Invalid address");
        address oldOracle = priceOracleAddress;
        priceOracleAddress = newOracle;
        emit PriceOracleUpdated(oldOracle, newOracle);
    }

    // ============ Treasury Management ============

    /**
     * @notice Update treasury address
     * @param newTreasury New treasury address
     */
    function updateTreasury(address newTreasury) external onlyRole(GUARDIAN_ROLE) {
        require(newTreasury != address(0), "Invalid address");
        address oldTreasury = treasuryAddress;
        treasuryAddress = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    /**
     * @notice Withdraw excess funds (guardian only, emergency)
     * @param token Token address (address(0) for ETH)
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(
        address token,
        uint256 amount
    ) external onlyRole(GUARDIAN_ROLE) {
        if (token == address(0)) {
            payable(guardianAddress).transfer(amount);
        } else {
            IERC20(token).safeTransfer(guardianAddress, amount);
        }
    }

    // ============ View Functions ============

    /**
     * @notice Get comprehensive buyback statistics
     */
    function getBuybackStats() external view returns (
        uint256 _totalRevenue,
        uint256 _allocatedToBuyback,
        uint256 _totalBuybackBudget,
        uint256 _totalTokensBought,
        uint256 _totalTokensBurned,
        uint256 _lastBuybackTimestamp,
        uint256 _priceFloorReference,
        bool _emergencyBuybackActive
    ) {
        return (
            totalRevenue,
            allocatedToBuyback,
            totalBuybackBudget,
            totalTokensBought,
            totalTokensBurned,
            lastBuybackTimestamp,
            priceFloorReference,
            emergencyBuybackActive
        );
    }

    /**
     * @notice Get current split ratios
     */
    function getSplitRatios() external view returns (uint256 multiplier, uint256 divisor) {
        return (splitMultiplier, splitDivisor);
    }

    // ============ Admin Controls ============

    /**
     * @notice Pause buyback operations
     */
    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause buyback operations
     */
    function unpause() external onlyRole(GUARDIAN_ROLE) {
        _unpause();
    }

    /**
     * @notice Allow contract to receive ETH
     */
    receive() external payable {
        // Revenue received in ETH
        if (msg.value > 0) {
            totalRevenue += msg.value;
            uint256 buybackAllocation = (msg.value * REVENUE_ALLOCATION_PERCENTAGE) / 100;
            totalBuybackBudget += buybackAllocation;
            allocatedToBuyback += buybackAllocation;
            emit RevenueReceived(msg.value, buybackAllocation);
        }
    }
}
