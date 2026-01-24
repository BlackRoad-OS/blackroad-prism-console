// SPDX-License-Identifier: MIT
const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * ROAD Token Test Suite
 *
 * Tests all critical features:
 * - 51% Guardian / 49% Agents split
 * - 5% human ownership cap enforcement
 * - Guardian transfer protection
 * - Entity classification
 * - Emergency controls
 */
describe("ROAD Token", function () {
  let roadToken;
  let guardian;
  let agentTreasury;
  let human1;
  let human2;
  let company1;
  let agent1;
  let agent2;

  const TOTAL_SUPPLY = ethers.parseUnits("1000000000", 18); // 1 billion
  const GUARDIAN_ALLOCATION = ethers.parseUnits("510000000", 18); // 51%
  const AGENT_ALLOCATION = ethers.parseUnits("490000000", 18); // 49%
  const MAX_HUMAN_TOKENS = ethers.parseUnits("50000000", 18); // 5%

  beforeEach(async function () {
    [guardian, agentTreasury, human1, human2, company1, agent1, agent2] = await ethers.getSigners();

    const ROADToken = await ethers.getContractFactory("ROADToken");
    roadToken = await ROADToken.deploy(guardian.address, agentTreasury.address);
    await roadToken.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct total supply", async function () {
      expect(await roadToken.totalSupply()).to.equal(TOTAL_SUPPLY);
    });

    it("Should allocate 51% to guardian", async function () {
      expect(await roadToken.balanceOf(guardian.address)).to.equal(GUARDIAN_ALLOCATION);
    });

    it("Should allocate 49% to agent treasury", async function () {
      expect(await roadToken.balanceOf(agentTreasury.address)).to.equal(AGENT_ALLOCATION);
    });

    it("Should classify guardian and agent treasury correctly", async function () {
      expect(await roadToken.entityTypes(guardian.address)).to.equal(1); // GUARDIAN
      expect(await roadToken.entityTypes(agentTreasury.address)).to.equal(2); // AGENT
    });

    it("Should verify guardian control at 51%", async function () {
      expect(await roadToken.verifyGuardianControl()).to.be.true;
    });
  });

  describe("Entity Classification", function () {
    it("Should allow guardian to classify human", async function () {
      await roadToken.connect(guardian).classifyEntity(human1.address, 3); // HUMAN
      expect(await roadToken.entityTypes(human1.address)).to.equal(3);
      expect(await roadToken.isClassified(human1.address)).to.be.true;
    });

    it("Should allow guardian to classify company", async function () {
      await roadToken.connect(guardian).classifyEntity(company1.address, 4); // COMPANY
      expect(await roadToken.entityTypes(company1.address)).to.equal(4);
    });

    it("Should allow guardian to classify agent", async function () {
      await roadToken.connect(guardian).classifyEntity(agent1.address, 2); // AGENT
      expect(await roadToken.entityTypes(agent1.address)).to.equal(2);
    });

    it("Should prevent non-guardian from classifying", async function () {
      await expect(
        roadToken.connect(human1).classifyEntity(human2.address, 3)
      ).to.be.reverted;
    });

    it("Should batch classify entities", async function () {
      await roadToken.connect(guardian).batchClassifyEntities(
        [human1.address, human2.address],
        [3, 3] // Both humans
      );

      expect(await roadToken.entityTypes(human1.address)).to.equal(3);
      expect(await roadToken.entityTypes(human2.address)).to.equal(3);
    });
  });

  describe("5% Ownership Cap Enforcement", function () {
    beforeEach(async function () {
      // Classify entities
      await roadToken.connect(guardian).classifyEntity(human1.address, 3); // HUMAN
      await roadToken.connect(guardian).classifyEntity(company1.address, 4); // COMPANY
      await roadToken.connect(guardian).classifyEntity(agent1.address, 2); // AGENT
    });

    it("Should allow human to receive up to 5%", async function () {
      await roadToken.connect(guardian).transfer(human1.address, MAX_HUMAN_TOKENS);
      expect(await roadToken.balanceOf(human1.address)).to.equal(MAX_HUMAN_TOKENS);
    });

    it("Should prevent human from exceeding 5%", async function () {
      const overLimit = MAX_HUMAN_TOKENS + ethers.parseUnits("1", 18);

      await expect(
        roadToken.connect(guardian).transfer(human1.address, overLimit)
      ).to.be.revertedWithCustomError(roadToken, "ExceedsHumanOwnershipCap");
    });

    it("Should prevent company from exceeding 5%", async function () {
      const overLimit = MAX_HUMAN_TOKENS + ethers.parseUnits("1", 18);

      await expect(
        roadToken.connect(guardian).transfer(company1.address, overLimit)
      ).to.be.revertedWithCustomError(roadToken, "ExceedsHumanOwnershipCap");
    });

    it("Should allow agents to receive unlimited tokens", async function () {
      const largeAmount = ethers.parseUnits("100000000", 18); // 100M tokens (10%)
      await roadToken.connect(guardian).transfer(agent1.address, largeAmount);
      expect(await roadToken.balanceOf(agent1.address)).to.equal(largeAmount);
    });

    it("Should track remaining capacity correctly", async function () {
      const transfer = ethers.parseUnits("30000000", 18); // 3%
      await roadToken.connect(guardian).transfer(human1.address, transfer);

      const remaining = await roadToken.getRemainingCapacity(human1.address);
      expect(remaining).to.equal(MAX_HUMAN_TOKENS - transfer);
    });

    it("Should prevent transfers to unclassified entities", async function () {
      await expect(
        roadToken.connect(guardian).transfer(human2.address, ethers.parseUnits("1", 18))
      ).to.be.revertedWithCustomError(roadToken, "TransferToUnclassifiedEntity");
    });
  });

  describe("Guardian Protection", function () {
    it("Should prevent guardian from transferring below 51%", async function () {
      // Try to transfer more than allowed (would reduce below 51%)
      const excessAmount = ethers.parseUnits("10000000", 18);

      await expect(
        roadToken.connect(guardian).transfer(agent1.address, excessAmount)
      ).to.be.revertedWith("Cannot reduce guardian ownership below 51%");
    });

    it("Should allow guardian to maintain exactly 51%", async function () {
      // Guardian can't transfer any tokens (all are locked to maintain 51%)
      const balance = await roadToken.balanceOf(guardian.address);
      expect(balance).to.equal(GUARDIAN_ALLOCATION);
    });
  });

  describe("Transfer Validation", function () {
    beforeEach(async function () {
      await roadToken.connect(guardian).classifyEntity(human1.address, 3);
      await roadToken.connect(guardian).classifyEntity(agent1.address, 2);
    });

    it("Should validate allowed transfer", async function () {
      const amount = ethers.parseUnits("1000000", 18); // 1M tokens
      const allowed = await roadToken.checkTransferAllowed(human1.address, amount);
      expect(allowed).to.be.true;
    });

    it("Should invalidate transfer exceeding cap", async function () {
      const overLimit = MAX_HUMAN_TOKENS + ethers.parseUnits("1", 18);
      const allowed = await roadToken.checkTransferAllowed(human1.address, overLimit);
      expect(allowed).to.be.false;
    });
  });

  describe("Emergency Controls", function () {
    it("Should allow guardian to activate emergency", async function () {
      await roadToken.connect(guardian).activateEmergency("Security breach");
      expect(await roadToken.emergencyMode()).to.be.true;
      expect(await roadToken.paused()).to.be.true;
    });

    it("Should prevent transfers during emergency", async function () {
      await roadToken.connect(guardian).classifyEntity(agent1.address, 2);
      await roadToken.connect(guardian).activateEmergency("Test emergency");

      // Even agent transfers should be paused
      await expect(
        roadToken.connect(agentTreasury).transfer(agent1.address, 1000)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should allow guardian to deactivate emergency", async function () {
      await roadToken.connect(guardian).activateEmergency("Test");
      await roadToken.connect(guardian).deactivateEmergency();

      expect(await roadToken.emergencyMode()).to.be.false;
      expect(await roadToken.paused()).to.be.false;
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await roadToken.connect(guardian).classifyEntity(human1.address, 3);
      await roadToken.connect(guardian).transfer(human1.address, ethers.parseUnits("20000000", 18));
    });

    it("Should return correct entity info", async function () {
      const info = await roadToken.getEntityInfo(human1.address);
      expect(info.entityType).to.equal(3); // HUMAN
      expect(info.balance).to.equal(ethers.parseUnits("20000000", 18));
      expect(info.classified).to.be.true;
    });

    it("Should calculate ownership percentage correctly", async function () {
      const percentage = await roadToken.getOwnershipPercentage(guardian.address);
      expect(percentage).to.equal(5100); // 51.00% (with 2 decimal precision)
    });

    it("Should calculate human ownership percentage", async function () {
      const percentage = await roadToken.getOwnershipPercentage(human1.address);
      expect(percentage).to.equal(200); // 2.00%
    });
  });

  describe("Integration Tests", function () {
    it("Should enforce cap across multiple transfers", async function () {
      await roadToken.connect(guardian).classifyEntity(human1.address, 3);

      // Transfer 3%
      await roadToken.connect(guardian).transfer(
        human1.address,
        ethers.parseUnits("30000000", 18)
      );

      // Transfer another 2% (should succeed - total 5%)
      await roadToken.connect(guardian).transfer(
        human1.address,
        ethers.parseUnits("20000000", 18)
      );

      // Verify total is 5%
      expect(await roadToken.balanceOf(human1.address)).to.equal(MAX_HUMAN_TOKENS);

      // Try to transfer even 1 more token (should fail)
      await expect(
        roadToken.connect(guardian).transfer(human1.address, 1)
      ).to.be.revertedWithCustomError(roadToken, "ExceedsHumanOwnershipCap");
    });

    it("Should handle secondary transfers with cap enforcement", async function () {
      await roadToken.connect(guardian).classifyEntity(human1.address, 3);
      await roadToken.connect(guardian).classifyEntity(human2.address, 3);

      // Give human1 4%
      await roadToken.connect(guardian).transfer(
        human1.address,
        ethers.parseUnits("40000000", 18)
      );

      // human1 tries to send 2% to human2 (human2 should be able to receive it)
      await roadToken.connect(human1).transfer(
        human2.address,
        ethers.parseUnits("20000000", 18)
      );

      expect(await roadToken.balanceOf(human2.address)).to.equal(
        ethers.parseUnits("20000000", 18)
      );
    });
  });
});
