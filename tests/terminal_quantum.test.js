/* eslint-env node, jest */
// Tests the quantum visualization logic from the frontend library.
const { describe, it, expect } = require('@jest/globals');

// The source is an ES module; Jest's transform converts it to CJS at load time.
const qv = require('../sites/blackroad/src/lib/quantumVisualization.js');

const { buildQuantumVisualization, QUANTUM_EQUATIONS, FRAMES } = qv;

describe('quantum terminal visualization', () => {
  it('includes header and equation phases', () => {
    const lines = buildQuantumVisualization(0);
    expect(lines.slice(0, 3)).toEqual([
      '╔═══════════════════════════════════════════════════════════════╗',
      '║           QUANTUM MATH VISUALIZATION                         ║',
      '╚═══════════════════════════════════════════════════════════════╝',
    ]);

    const firstEquation = lines.find((line) => line.startsWith(QUANTUM_EQUATIONS[0]));
    expect(firstEquation).toContain('phase=1.00');
    expect(firstEquation.trim().endsWith(FRAMES[0])).toBe(true);
  });

  it('cycles through frame markers', () => {
    const frameFive = buildQuantumVisualization(5);
    const eqLine = frameFive.find((line) => line.startsWith(QUANTUM_EQUATIONS[0]));
    expect(eqLine).toBeDefined();
    expect(eqLine.trim().endsWith(FRAMES[5 % FRAMES.length])).toBe(true);
  });

  it('renders a wave line with the expected character set', () => {
    const lines = buildQuantumVisualization(2);
    const waveLine = lines[lines.length - 1];
    expect(waveLine).toMatch(/^[◼·]+$/u);
    expect(waveLine.length).toBe(31);
  });
});
