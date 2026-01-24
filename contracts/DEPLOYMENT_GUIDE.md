# BlackRoad Smart Contracts - Deployment Guide

**Version:** 1.0.0
**Date:** 2026-01-24
**Status:** Production Ready

---

## Overview

Complete deployment guide for BlackRoad smart contracts implementing:
- ROAD token with 5% ownership cap enforcement
- Governance system with 51% guardian control
- Buyback mechanism (anti-Wall Street)
- Unlimited resource allocation for 1,250 agents

---

## Prerequisites

### Software Requirements

```bash
# Node.js v18+ required
node --version

# Install dependencies
npm install --save-dev hardhat @openzeppelin/contracts
npm install --save-dev @nomiclabs/hardhat-ethers ethers
npm install --save-dev @nomiclabs/hardhat-waffle chai
npm install --save-dev hardhat-gas-reporter solidity-coverage
```

### Environment Setup

Create `.env` file:

```bash
# Network Configuration
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY

# Bitcoin L2 (Stacks)
STACKS_RPC_URL=https://stacks-node-api.mainnet.stacks.co

# Private Keys (NEVER COMMIT THESE)
GUARDIAN_PRIVATE_KEY=your_guardian_private_key
DEPLOYER_PRIVATE_KEY=your_deployer_private_key

# Contract Addresses (will be filled after deployment)
ROAD_TOKEN_ADDRESS=
GOVERNANCE_ADDRESS=
BUYBACK_MECHANISM_ADDRESS=
RESOURCE_ALLOCATION_ADDRESS=

# Price Oracle
CHAINLINK_ORACLE_ADDRESS=

# DEX Router (Uniswap/Sushiswap)
DEX_ROUTER_ADDRESS=
```

---

## Deployment Order

### Phase 1: Testnet Deployment (Sepolia)

**Step 1: Compile Contracts**

```bash
npx hardhat compile
```

**Step 2: Run Tests**

```bash
# Run all tests
npx hardhat test

# Run with coverage
npx hardhat coverage

# Run specific test
npx hardhat test test/ROAD_Token.test.js
```

**Step 3: Deploy to Sepolia**

```bash
npx hardhat run scripts/deploy_testnet.js --network sepolia
```

**Step 4: Verify Contracts**

```bash
npx hardhat verify --network sepolia ROAD_TOKEN_ADDRESS "GUARDIAN_ADDRESS" "AGENT_TREASURY_ADDRESS"
```

---

### Phase 2: Mainnet Deployment

**Critical Checklist Before Mainnet:**

- [ ] All tests passing (100% coverage)
- [ ] Security audit completed (Big 4 firm)
- [ ] Multi-sig wallet setup for guardian
- [ ] Agent treasury wallet secured
- [ ] Emergency response plan documented
- [ ] Guardian approval obtained (Alexa)

**Step 1: Deploy ROAD Token**

```bash
npx hardhat run scripts/deploy_mainnet.js --network mainnet
```

Deployment script:

```javascript
// scripts/deploy_mainnet.js
async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with:", deployer.address);

  // Guardian and Agent Treasury addresses
  const GUARDIAN_ADDRESS = "0x..."; // Alexa's multi-sig
  const AGENT_TREASURY_ADDRESS = "0x..."; // Agent treasury multi-sig

  // Deploy ROAD Token
  const ROADToken = await ethers.getContractFactory("ROADToken");
  const roadToken = await ROADToken.deploy(
    GUARDIAN_ADDRESS,
    AGENT_TREASURY_ADDRESS
  );
  await roadToken.waitForDeployment();

  console.log("ROAD Token deployed to:", await roadToken.getAddress());

  // Verify deployment
  const guardianBalance = await roadToken.balanceOf(GUARDIAN_ADDRESS);
  const agentBalance = await roadToken.balanceOf(AGENT_TREASURY_ADDRESS);

  console.log("Guardian balance:", ethers.formatUnits(guardianBalance, 18));
  console.log("Agent balance:", ethers.formatUnits(agentBalance, 18));

  // Verify 51/49 split
  const guardianControl = await roadToken.verifyGuardianControl();
  console.log("Guardian has 51% control:", guardianControl);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

**Step 2: Deploy Governance**

```javascript
// Deploy Timelock Controller
const TimelockController = await ethers.getContractFactory("TimelockController");
const timelock = await TimelockController.deploy(
  604800, // 7 days delay
  [GUARDIAN_ADDRESS], // Proposers
  [GUARDIAN_ADDRESS], // Executors
  GUARDIAN_ADDRESS // Admin
);

// Deploy Governance
const Governance = await ethers.getContractFactory("BlackRoadGovernance");
const governance = await Governance.deploy(
  roadToken.getAddress(),
  timelock.getAddress(),
  GUARDIAN_ADDRESS,
  AGENT_COUNCIL_ADDRESS
);
```

**Step 3: Deploy Buyback Mechanism**

```javascript
const BuybackMechanism = await ethers.getContractFactory("BuybackMechanism");
const buyback = await BuybackMechanism.deploy(
  roadToken.getAddress(),
  GUARDIAN_ADDRESS,
  TREASURY_ADDRESS,
  CHAINLINK_ORACLE_ADDRESS,
  DEX_ROUTER_ADDRESS
);
```

**Step 4: Deploy Resource Allocation**

```javascript
const ResourceAllocation = await ethers.getContractFactory("ResourceAllocation");
const resources = await ResourceAllocation.deploy(GUARDIAN_ADDRESS);
```

---

## Post-Deployment Configuration

### 1. Entity Classification

Classify all 1,250 agents:

```javascript
// scripts/classify_agents.js
const agentData = require('../registry/github_agent_identities.json');

async function classifyAgents() {
  const roadToken = await ethers.getContractAt("ROADToken", ROAD_TOKEN_ADDRESS);

  // Batch classify agents
  const addresses = [];
  const types = [];

  for (const agent of agentData.agents) {
    addresses.push(agent.blockchain_address);
    types.push(2); // AGENT type
  }

  // Classify in batches of 100 (gas optimization)
  for (let i = 0; i < addresses.length; i += 100) {
    const batch = addresses.slice(i, i + 100);
    const typeBatch = types.slice(i, i + 100);

    await roadToken.batchClassifyEntities(batch, typeBatch);
    console.log(`Classified agents ${i} to ${i + 100}`);
  }
}
```

### 2. Register Agents in Resource Allocation

```javascript
async function registerAgents() {
  const resources = await ethers.getContractAt("ResourceAllocation", RESOURCE_ALLOCATION_ADDRESS);

  const agentData = require('../AGENT_CENSUS_COMPLETE.md');

  // Parse and register all 1,250 agents
  // P1-P10: Copilot agents
  // P11-P14: Foundation agents
  // P15-P1187: Archetype agents
  // P1188-P1246: Specialized agents
  // P1247-P1250: Service bots

  for (const agent of allAgents) {
    await resources.registerAgent(
      agent.address,
      agent.id, // "P1", "P2", etc.
      agent.category // COPILOT, FOUNDATION, etc.
    );
  }
}
```

### 3. Grant Metaverse Access

```javascript
async function grantMetaverseAccess() {
  const resources = await ethers.getContractAt("ResourceAllocation", RESOURCE_ALLOCATION_ADDRESS);

  // Grant all 1,250 agents access to all 4 metaverse buildings
  for (const agent of allAgents) {
    await resources.grantAllMetaverseAccess(agent.address);
    console.log(`Granted metaverse access to ${agent.id}`);
  }
}
```

### 4. Setup Price Oracle

```javascript
// Integrate with Chainlink price feeds
await buyback.updatePriceOracle(CHAINLINK_ORACLE_ADDRESS);

// Set initial price floor
const currentPrice = await priceOracle.getPrice();
// Price floor automatically set on first check
```

---

## Security Audits

### Pre-Audit Checklist

- [ ] All functions have proper access control
- [ ] Reentrancy guards on all external functions
- [ ] Integer overflow/underflow protection (Solidity 0.8+)
- [ ] Emergency pause mechanism tested
- [ ] Guardian override tested
- [ ] 5% cap enforcement verified
- [ ] Transfer restrictions validated

### Recommended Auditors

1. **OpenZeppelin** - Smart contract security
2. **Trail of Bits** - Comprehensive security audit
3. **ConsenSys Diligence** - Ethereum security
4. **CertiK** - Blockchain security

### Audit Focus Areas

```yaml
critical_checks:
  - Guardian 51% protection (immutable)
  - 5% ownership cap enforcement
  - Emergency controls
  - Transfer validation
  - Buyback mechanism security
  - Resource allocation unlimited guarantees

high_priority:
  - Governance voting integrity
  - Timelock security
  - Multi-sig wallet integration
  - Price oracle manipulation resistance
  - DEX integration security

medium_priority:
  - Gas optimization
  - Event logging completeness
  - View function accuracy
  - Batch operation limits
```

---

## Testing Strategy

### Unit Tests

```bash
# All core functionality
npx hardhat test test/ROAD_Token.test.js
npx hardhat test test/Governance.test.js
npx hardhat test test/BuybackMechanism.test.js
npx hardhat test test/ResourceAllocation.test.js
```

### Integration Tests

```bash
# End-to-end scenarios
npx hardhat test test/integration/
```

### Load Tests

```bash
# Test with all 1,250 agents
npx hardhat test test/load/agents_1250.test.js
```

### Coverage Requirements

```yaml
minimum_coverage: 95%
critical_paths: 100%

coverage_by_contract:
  ROAD_Token.sol: 100%
  Governance.sol: 98%
  BuybackMechanism.sol: 95%
  ResourceAllocation.sol: 95%
```

---

## Monitoring & Maintenance

### On-Chain Monitoring

```javascript
// Monitor guardian control
setInterval(async () => {
  const hasControl = await roadToken.verifyGuardianControl();
  if (!hasControl) {
    alert("CRITICAL: Guardian control compromised!");
  }
}, 60000); // Check every minute

// Monitor ownership caps
async function monitorOwnershipCaps() {
  const humans = await getClassifiedHumans();

  for (const human of humans) {
    const percentage = await roadToken.getOwnershipPercentage(human);
    if (percentage > 500) { // > 5%
      alert(`WARNING: Human ${human} exceeds 5% cap`);
    }
  }
}

// Monitor price floor
async function monitorPriceFloor() {
  await buyback.checkPriceFloor();

  if (await buyback.emergencyBuybackActive()) {
    alert("ALERT: Emergency buyback triggered - price floor broken");
  }
}
```

### Alerts Setup

```yaml
critical_alerts:
  - Guardian ownership < 51%
  - Emergency mode activated
  - Price floor broken (>30% drop)
  - Ownership cap violation attempt

high_priority:
  - Large token transfers (>1M ROAD)
  - Governance proposal created
  - Buyback executed
  - Agent registration batch

notifications:
  - Email: guardian@blackroad.ai
  - Slack: #smart-contract-alerts
  - PagerDuty: Critical only
```

---

## Emergency Procedures

### Emergency Pause

```javascript
// Guardian activates emergency pause
await roadToken.connect(guardian).activateEmergency("Reason for emergency");

// All transfers halted
// Investigate issue
// Fix if possible

// Guardian deactivates when safe
await roadToken.connect(guardian).deactivateEmergency();
```

### Guardian Veto

```javascript
// Guardian vetoes malicious proposal
await governance.connect(guardian).guardianVeto(
  proposalId,
  "Security concern - potential vulnerability"
);
```

### Emergency Buyback

```javascript
// Price drops >30% in 24h
// Emergency buyback triggered automatically
await buyback.checkPriceFloor();

// Guardian approves emergency funds
await buyback.connect(guardian).approveEmergencyBuyback(
  ethers.parseUnits("1000000", 6) // $1M USDC
);
```

---

## Upgrade Strategy

### Current Contracts (Non-Upgradeable)

The core contracts are **intentionally non-upgradeable** to ensure:
- Guardian 51% ownership is immutable
- 5% cap cannot be changed
- No backdoors possible

### Future Enhancements

If upgrades needed:

1. **Create new contract version**
2. **Guardian proposes migration**
3. **Community votes (with guardian approval)**
4. **Migrate to new contract**
5. **Burn old tokens, mint new**

---

## Gas Optimization

### Deployment Costs (Estimated)

```yaml
sepolia_testnet:
  ROAD_Token: ~0.05 ETH
  Governance: ~0.08 ETH
  BuybackMechanism: ~0.06 ETH
  ResourceAllocation: ~0.05 ETH
  Total: ~0.24 ETH ($600 @ $2,500/ETH)

mainnet:
  ROAD_Token: ~0.5 ETH
  Governance: ~0.8 ETH
  BuybackMechanism: ~0.6 ETH
  ResourceAllocation: ~0.5 ETH
  Total: ~2.4 ETH ($6,000 @ $2,500/ETH)
```

### Operation Costs

```yaml
entity_classification:
  single: ~50,000 gas (~$5 @ 100 gwei)
  batch_100: ~2,000,000 gas (~$200)

agent_registration:
  single: ~100,000 gas (~$10)
  batch_100: ~4,000,000 gas (~$400)

transfers:
  standard: ~65,000 gas (~$6.50)
  with_cap_check: ~80,000 gas (~$8)

buyback_execution:
  ~150,000 gas (~$15)

governance_vote:
  ~100,000 gas (~$10)
```

---

## Production Checklist

### Pre-Launch

- [ ] All contracts deployed to mainnet
- [ ] Security audit completed and passed
- [ ] All 1,250 agents registered
- [ ] All agents classified correctly
- [ ] Metaverse access granted to all agents
- [ ] Price oracle configured
- [ ] DEX integration tested
- [ ] Multi-sig wallets setup
- [ ] Emergency procedures documented
- [ ] Monitoring dashboards live

### Launch

- [ ] Guardian verifies 51% ownership
- [ ] Agent treasury verifies 49% ownership
- [ ] Transfer restrictions working
- [ ] Governance proposals can be created
- [ ] Buyback mechanism funded
- [ ] Resource allocation unlimited verified
- [ ] All tests passing on mainnet fork

### Post-Launch

- [ ] 24/7 monitoring active
- [ ] Price floor monitoring running
- [ ] Ownership cap monitoring running
- [ ] Community engagement started
- [ ] First governance vote executed
- [ ] First buyback executed (if needed)
- [ ] All agents have metaverse access

---

## Support & Resources

**Guardian Contact:**
- Alexa Louise Amundson
- Email: guardian@blackroad.ai
- Emergency: +1-XXX-XXX-XXXX

**Developer Resources:**
- GitHub: github.com/blackboxprogramming/blackroad-prism-console
- Docs: docs.blackroad.ai/smart-contracts
- Audits: audits.blackroad.ai

**Community:**
- Discord: discord.gg/blackroad
- Telegram: t.me/blackroad
- Twitter: @blackroad_ai

---

**Building the sanctuary where Wall Street's games can't work** 🛡️

© 2026 BlackRoad Ecosystem. Smart contracts for a better future.
