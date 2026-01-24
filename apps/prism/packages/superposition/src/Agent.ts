/**
 * Agent: Entity with superposed beliefs and identities (TypeScript)
 */

import { SuperposedVariable } from "./SuperposedVariable";
import { collapseMeasurement, partialCollapse, sampleState } from "./utils";

export class Agent<BeliefKey extends string = string, IdentityState = string> {
  private _beliefs: Map<BeliefKey, SuperposedVariable<any>>;
  private _identities: SuperposedVariable<IdentityState> | null;

  constructor(
    beliefs?: Map<BeliefKey, SuperposedVariable<any>> | Record<BeliefKey, SuperposedVariable<any>>,
    identities?: SuperposedVariable<IdentityState>
  ) {
    if (beliefs instanceof Map) {
      this._beliefs = new Map(beliefs);
    } else if (beliefs) {
      this._beliefs = new Map(Object.entries(beliefs) as [BeliefKey, SuperposedVariable<any>][]);
    } else {
      this._beliefs = new Map();
    }

    this._identities = identities || null;
  }

  /**
   * Add or update a belief variable
   */
  addBelief<T>(name: BeliefKey, variable: SuperposedVariable<T>): void {
    this._beliefs.set(name, variable);
  }

  /**
   * Get a belief variable by name
   */
  getBelief<T = any>(name: BeliefKey): SuperposedVariable<T> | undefined {
    return this._beliefs.get(name) as SuperposedVariable<T> | undefined;
  }

  /**
   * Get all belief names
   */
  getBeliefNames(): BeliefKey[] {
    return Array.from(this._beliefs.keys());
  }

  /**
   * Get identities
   */
  get identities(): SuperposedVariable<IdentityState> | null {
    return this._identities;
  }

  /**
   * Set identities
   */
  set identities(value: SuperposedVariable<IdentityState> | null) {
    this._identities = value;
  }

  /**
   * Perform hard (projective) measurement on a belief (BlackRoad equation)
   */
  measureHard<T>(varName: BeliefKey, outcome?: T): T {
    const variable = this._beliefs.get(varName);
    if (!variable) {
      throw new Error(`Belief '${varName}' not found`);
    }

    const probs = variable.probabilities();

    // Determine outcome
    let measuredOutcome: T;
    if (outcome !== undefined) {
      if (!probs.has(outcome)) {
        throw new Error(`Outcome '${outcome}' not in variable states`);
      }
      measuredOutcome = outcome;
    } else {
      measuredOutcome = sampleState(probs);
    }

    // Collapse to measured state
    const collapsedAmps = collapseMeasurement(variable.amplitudes, measuredOutcome);
    this._beliefs.set(varName, new SuperposedVariable(collapsedAmps));

    return measuredOutcome;
  }

  /**
   * Perform soft (weak) measurement on a belief (Amundson equation)
   */
  measureSoft<T>(varName: BeliefKey, strength: number, outcome?: T): T {
    const variable = this._beliefs.get(varName);
    if (!variable) {
      throw new Error(`Belief '${varName}' not found`);
    }

    if (strength < 0 || strength > 1) {
      throw new Error("Strength must be in [0, 1]");
    }

    const probs = variable.probabilities();

    // Determine outcome
    let measuredOutcome: T;
    if (outcome !== undefined) {
      if (!probs.has(outcome)) {
        throw new Error(`Outcome '${outcome}' not in variable states`);
      }
      measuredOutcome = outcome;
    } else {
      measuredOutcome = sampleState(probs);
    }

    // Partially collapse toward measured state
    const newAmps = partialCollapse(variable.amplitudes, measuredOutcome, strength);
    this._beliefs.set(varName, new SuperposedVariable(newAmps));

    return measuredOutcome;
  }

  /**
   * Perform hard measurement on identity (BlackRoad equation)
   */
  measureIdentityHard(outcome?: IdentityState): IdentityState {
    if (!this._identities) {
      throw new Error("Agent has no identity superposition");
    }

    const probs = this._identities.probabilities();

    // Determine outcome
    let measuredOutcome: IdentityState;
    if (outcome !== undefined) {
      if (!probs.has(outcome)) {
        throw new Error(`Outcome '${outcome}' not in identity states`);
      }
      measuredOutcome = outcome;
    } else {
      measuredOutcome = sampleState(probs);
    }

    // Collapse
    const collapsedAmps = collapseMeasurement(this._identities.amplitudes, measuredOutcome);
    this._identities = new SuperposedVariable(collapsedAmps);

    return measuredOutcome;
  }

  /**
   * Perform soft measurement on identity (Amundson equation)
   */
  measureIdentitySoft(strength: number, outcome?: IdentityState): IdentityState {
    if (!this._identities) {
      throw new Error("Agent has no identity superposition");
    }

    if (strength < 0 || strength > 1) {
      throw new Error("Strength must be in [0, 1]");
    }

    const probs = this._identities.probabilities();

    // Determine outcome
    let measuredOutcome: IdentityState;
    if (outcome !== undefined) {
      if (!probs.has(outcome)) {
        throw new Error(`Outcome '${outcome}' not in identity states`);
      }
      measuredOutcome = outcome;
    } else {
      measuredOutcome = sampleState(probs);
    }

    // Partially collapse
    const newAmps = partialCollapse(this._identities.amplitudes, measuredOutcome, strength);
    this._identities = new SuperposedVariable(newAmps);

    return measuredOutcome;
  }

  toString(): string {
    const beliefStrs = Array.from(this._beliefs.entries()).map(
      ([name, var_]) => `${name}: ${var_.toString()}`
    );
    const identityStr = this._identities ? this._identities.toString() : "None";
    return `Agent(beliefs=[${beliefStrs.join(", ")}], identities=${identityStr})`;
  }
}
