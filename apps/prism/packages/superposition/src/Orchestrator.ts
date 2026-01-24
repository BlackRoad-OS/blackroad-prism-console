/**
 * Orchestrator: Manages measurement operations with coherence budget tracking (TypeScript)
 */

import { Agent } from "./Agent";

export class CoherenceBudget {
  constructor(public value: number) {}

  /**
   * Attempt to consume coherence budget
   */
  consume(amount: number): boolean {
    if (amount < 0) {
      throw new Error("Cannot consume negative amount");
    }

    if (this.value >= amount) {
      this.value -= amount;
      return true;
    }
    return false;
  }

  /**
   * Add to the coherence budget
   */
  replenish(amount: number): void {
    if (amount < 0) {
      throw new Error("Cannot replenish negative amount");
    }
    this.value += amount;
  }

  /**
   * Check if budget is depleted
   */
  isDepleted(): boolean {
    return this.value <= 0;
  }
}

export interface MeasurementConfig {
  /**
   * Measurement strength μ in [0, 1]
   * 0 = no effect, 1 = full collapse
   */
  strength: number;

  /**
   * Optional temperature adjustment after measurement
   */
  temperatureShift?: number;

  /**
   * Multiplier for coherence budget consumption
   */
  costMultiplier?: number;
}

export interface MeasurementRecord {
  varName: string;
  mode: "belief" | "identity";
  strength: number;
  outcome: any;
  cost: number;
  remainingBudget: number;
  timestamp: number;
}

export type MeasurementMode = "belief" | "identity";

export class Orchestrator {
  private coherenceBudget: CoherenceBudget;
  private measurementHistory: MeasurementRecord[] = [];

  constructor(coherenceBudget?: CoherenceBudget) {
    this.coherenceBudget = coherenceBudget || new CoherenceBudget(Infinity);
  }

  /**
   * Perform a measurement on an agent variable
   *
   * Applies the full measurement protocol:
   * 1. Validates coherence budget
   * 2. Performs measurement based on strength
   * 3. Consumes budget
   * 4. Applies optional temperature shift
   * 5. Records measurement in history
   */
  measure<T>(
    agent: Agent,
    varName: string,
    config: MeasurementConfig,
    mode: MeasurementMode = "belief",
    outcome?: T
  ): [T | null, boolean] {
    // Calculate measurement cost
    const costMultiplier = config.costMultiplier || 1.0;
    const cost = config.strength * costMultiplier;

    // Check budget
    if (!this.coherenceBudget.consume(cost)) {
      return [null, false];
    }

    let measuredOutcome: T;

    try {
      // Perform measurement based on mode and strength
      if (mode === "belief") {
        if (config.strength >= 0.99) {
          // Treat near-1 as hard measurement
          measuredOutcome = agent.measureHard(varName as any, outcome);
        } else {
          measuredOutcome = agent.measureSoft(varName as any, config.strength, outcome);
        }

        // Apply temperature shift if specified
        if (config.temperatureShift !== undefined) {
          const belief = agent.getBelief(varName as any);
          if (belief) {
            const adjusted = belief.withTemperature(config.temperatureShift);
            agent.addBelief(varName as any, adjusted);
          }
        }
      } else if (mode === "identity") {
        if (config.strength >= 0.99) {
          measuredOutcome = agent.measureIdentityHard(outcome);
        } else {
          measuredOutcome = agent.measureIdentitySoft(config.strength, outcome);
        }

        // Apply temperature shift if specified
        if (config.temperatureShift !== undefined && agent.identities) {
          agent.identities = agent.identities.withTemperature(config.temperatureShift);
        }
      } else {
        throw new Error(`Invalid mode: ${mode}. Must be 'belief' or 'identity'`);
      }
    } catch (error) {
      // Refund budget on error
      this.coherenceBudget.replenish(cost);
      throw error;
    }

    // Record measurement
    this.measurementHistory.push({
      varName,
      mode,
      strength: config.strength,
      outcome: measuredOutcome,
      cost,
      remainingBudget: this.coherenceBudget.value,
      timestamp: Date.now(),
    });

    return [measuredOutcome, true];
  }

  /**
   * Get current coherence budget value
   */
  getBudget(): number {
    return this.coherenceBudget.value;
  }

  /**
   * Add to the coherence budget
   */
  replenishBudget(amount: number): void {
    this.coherenceBudget.replenish(amount);
  }

  /**
   * Reset coherence budget to a new value
   */
  resetBudget(newValue: number): void {
    if (newValue < 0) {
      throw new Error("Budget value must be non-negative");
    }
    this.coherenceBudget.value = newValue;
  }

  /**
   * Get measurement history
   */
  getHistory(): MeasurementRecord[] {
    return [...this.measurementHistory];
  }

  /**
   * Clear measurement history
   */
  clearHistory(): void {
    this.measurementHistory = [];
  }

  /**
   * Get recent measurements (last N)
   */
  getRecentHistory(count: number = 10): MeasurementRecord[] {
    return this.measurementHistory.slice(-count);
  }

  /**
   * Get history filtered by variable name
   */
  getHistoryForVariable(varName: string): MeasurementRecord[] {
    return this.measurementHistory.filter((r) => r.varName === varName);
  }
}
