/**
 * SuperposedVariable: Quantum-inspired representation of belief states (TypeScript)
 *
 * This is the TypeScript port of the Python br_superposition module.
 * Implements BlackRoad (established quantum mechanics) and Amundson (novel extensions) equations.
 */

/**
 * Complex number representation
 */
export interface Complex {
  real: number;
  imag: number;
}

export function complex(real: number, imag: number = 0): Complex {
  return { real, imag };
}

export function magnitude(c: Complex): number {
  return Math.sqrt(c.real * c.real + c.imag * c.imag);
}

export function phase(c: Complex): number {
  return Math.atan2(c.imag, c.real);
}

export function multiply(a: Complex, b: number): Complex {
  return { real: a.real * b, imag: a.imag * b };
}

export function add(a: Complex, b: Complex): Complex {
  return { real: a.real + b.real, imag: a.imag + b.imag };
}

export function fromPolar(magnitude: number, phase: number): Complex {
  return {
    real: magnitude * Math.cos(phase),
    imag: magnitude * Math.sin(phase),
  };
}

/**
 * SuperposedVariable class
 *
 * Represents a variable in superposition with complex amplitudes.
 */
export class SuperposedVariable<T = string> {
  private _amplitudes: Map<T, Complex>;

  constructor(amplitudes: Map<T, Complex> | Record<string, Complex>) {
    if (amplitudes instanceof Map) {
      this._amplitudes = new Map(amplitudes);
    } else {
      this._amplitudes = new Map(Object.entries(amplitudes) as [T, Complex][]);
    }

    if (this._amplitudes.size === 0) {
      throw new Error("amplitudes cannot be empty");
    }

    this.normalize();
  }

  /**
   * Normalize amplitudes so that sum of |a|² = 1 (BlackRoad equation: Born rule)
   */
  private normalize(): void {
    let total = 0;
    for (const amp of this._amplitudes.values()) {
      total += magnitude(amp) ** 2;
    }

    if (total === 0) {
      throw new Error("Cannot normalize zero amplitudes");
    }

    const sqrtTotal = Math.sqrt(total);
    for (const [state, amp] of this._amplitudes.entries()) {
      this._amplitudes.set(state, multiply(amp, 1 / sqrtTotal));
    }
  }

  /**
   * Get amplitudes map
   */
  get amplitudes(): Map<T, Complex> {
    return new Map(this._amplitudes);
  }

  /**
   * Calculate probabilities using Born rule (BlackRoad equation)
   */
  probabilities(): Map<T, number> {
    const probs = new Map<T, number>();
    for (const [state, amp] of this._amplitudes.entries()) {
      probs.set(state, magnitude(amp) ** 2);
    }
    return probs;
  }

  /**
   * Calculate Shannon entropy (BlackRoad equation)
   *
   * H = -Σ pᵢ log₂(pᵢ)
   */
  entropy(): number {
    const probs = this.probabilities();
    let entropy = 0;

    for (const p of probs.values()) {
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    return entropy;
  }

  /**
   * Apply temperature transform (Amundson equation)
   *
   * pᵢ(T) ∝ pᵢ^(1/T)
   *
   * @param T Temperature parameter (T < 1: sharpen, T > 1: flatten)
   */
  withTemperature(T: number): SuperposedVariable<T> {
    if (T <= 0) {
      throw new Error("Temperature must be positive");
    }

    const probs = this.probabilities();

    // Apply temperature transform
    const transformedProbs = new Map<T, number>();
    for (const [state, p] of probs.entries()) {
      transformedProbs.set(state, Math.pow(p, 1.0 / T));
    }

    // Normalize
    let total = 0;
    for (const p of transformedProbs.values()) {
      total += p;
    }

    if (total === 0) {
      throw new Error("Temperature transform resulted in zero probabilities");
    }

    const normalizedProbs = new Map<T, number>();
    for (const [state, p] of transformedProbs.entries()) {
      normalizedProbs.set(state, p / total);
    }

    // Convert back to amplitudes (keep original phases)
    const newAmplitudes = new Map<T, Complex>();
    for (const [state, newProb] of normalizedProbs.entries()) {
      const originalAmp = this._amplitudes.get(state)!;
      const originalPhase = phase(originalAmp);
      const newMagnitude = Math.sqrt(newProb);
      newAmplitudes.set(state, fromPolar(newMagnitude, originalPhase));
    }

    return new SuperposedVariable(newAmplitudes);
  }

  /**
   * Get phase of a specific state
   */
  getPhase(state: T): number {
    const amp = this._amplitudes.get(state);
    if (!amp) {
      throw new Error(`State '${state}' not found`);
    }
    return phase(amp);
  }

  /**
   * Get magnitude of a specific state
   */
  getMagnitude(state: T): number {
    const amp = this._amplitudes.get(state);
    if (!amp) {
      throw new Error(`State '${state}' not found`);
    }
    return magnitude(amp);
  }

  /**
   * Get all states
   */
  states(): T[] {
    return Array.from(this._amplitudes.keys());
  }

  toString(): string {
    const probs = this.probabilities();
    const items = Array.from(probs.entries())
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([state, prob]) => `${state}: ${prob.toFixed(3)}`);
    return `SuperposedVariable(${items.join(", ")})`;
  }
}
