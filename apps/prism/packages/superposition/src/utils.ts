/**
 * Utility functions for BlackRoad / Amundson superposition framework (TypeScript)
 */

import { Complex, magnitude, phase } from "./SuperposedVariable";
import type { SuperposedVariable } from "./SuperposedVariable";

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Calculate maximum phase difference between states (Amundson equation)
 */
export function phaseGap(amplitudes: Map<any, Complex>): number {
  if (amplitudes.size === 0) return 0;

  const phases = Array.from(amplitudes.values()).map((amp) => phase(amp));

  if (phases.length < 2) return 0;

  let maxGap = 0;
  for (let i = 0; i < phases.length; i++) {
    for (let j = i + 1; j < phases.length; j++) {
      let diff = Math.abs(phases[i] - phases[j]);
      // Take shorter arc
      diff = Math.min(diff, 2 * Math.PI - diff);
      maxGap = Math.max(maxGap, diff);
    }
  }

  return maxGap;
}

/**
 * Calculate contradiction energy (Amundson equation)
 *
 * K(t) = C × exp(λ × |Δ|)
 */
export function contradictionEnergy(C: number, delta: number, lambda: number): number {
  return C * Math.exp(lambda * Math.abs(delta));
}

/**
 * Map superposition states to 2D spiral coordinates (Amundson equation)
 */
export function spiralMapping<T>(
  amplitudes: Map<T, Complex>,
  center: Point2D = { x: 0, y: 0 }
): Map<T, Point2D> {
  const coords = new Map<T, Point2D>();

  for (const [state, amp] of amplitudes.entries()) {
    const mag = magnitude(amp);
    const ph = phase(amp);

    // Convert polar to Cartesian
    const x = center.x + mag * Math.cos(ph);
    const y = center.y + mag * Math.sin(ph);

    coords.set(state, { x, y });
  }

  return coords;
}

/**
 * Calculate Hellinger distance between two superposed variables (Amundson equation)
 */
export function beliefDistance<T>(var1: SuperposedVariable<T>, var2: SuperposedVariable<T>): number {
  const probs1 = var1.probabilities();
  const probs2 = var2.probabilities();

  // Get union of all states
  const allStates = new Set([...probs1.keys(), ...probs2.keys()]);

  let sumSquaredDiff = 0;
  for (const state of allStates) {
    const p1 = probs1.get(state) || 0;
    const p2 = probs2.get(state) || 0;
    sumSquaredDiff += Math.pow(Math.sqrt(p1) - Math.sqrt(p2), 2);
  }

  return Math.sqrt(0.5 * sumSquaredDiff);
}

/**
 * Simulate quantum collapse to a measured state (BlackRoad equation)
 */
export function collapseMeasurement<T>(amplitudes: Map<T, Complex>, measuredState: T): Map<T, Complex> {
  if (!amplitudes.has(measuredState)) {
    throw new Error(`Measured state '${measuredState}' not in amplitudes`);
  }

  const collapsed = new Map<T, Complex>();
  for (const state of amplitudes.keys()) {
    collapsed.set(state, state === measuredState ? { real: 1, imag: 0 } : { real: 0, imag: 0 });
  }

  return collapsed;
}

/**
 * Simulate partial (weak) measurement (Amundson equation)
 */
export function partialCollapse<T>(
  amplitudes: Map<T, Complex>,
  measuredState: T,
  strength: number
): Map<T, Complex> {
  if (strength < 0 || strength > 1) {
    throw new Error("Strength must be in [0, 1]");
  }

  if (!amplitudes.has(measuredState)) {
    throw new Error(`Measured state '${measuredState}' not in amplitudes`);
  }

  const collapsed = collapseMeasurement(amplitudes, measuredState);

  // Interpolate: (1 - μ) × original + μ × collapsed
  const result = new Map<T, Complex>();
  for (const [state, origAmp] of amplitudes.entries()) {
    const collAmp = collapsed.get(state)!;
    result.set(state, {
      real: (1 - strength) * origAmp.real + strength * collAmp.real,
      imag: (1 - strength) * origAmp.imag + strength * collAmp.imag,
    });
  }

  return result;
}

/**
 * Sample a state from probability distribution
 */
export function sampleState<T>(probabilities: Map<T, number>): T {
  const rand = Math.random();
  let cumulative = 0;

  for (const [state, prob] of probabilities.entries()) {
    cumulative += prob;
    if (rand <= cumulative) {
      return state;
    }
  }

  // Fallback (shouldn't happen with normalized probabilities)
  return Array.from(probabilities.keys())[0];
}
