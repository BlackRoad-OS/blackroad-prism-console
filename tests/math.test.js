const { add } = require('../src/utils/math');

describe('add', () => {
  it('adds two positive numbers', () => {
    expect(add(1, 2)).toBe(3);
  });

  it('adds negative numbers', () => {
    expect(add(-1, -2)).toBe(-3);
  });

  it('adds zero', () => {
    expect(add(0, 5)).toBe(5);
    expect(add(5, 0)).toBe(5);
  });

  it('handles floating point', () => {
    expect(add(0.1, 0.2)).toBeCloseTo(0.3);
  });

  it('coerces string inputs via + operator', () => {
    // add uses the + operator which concatenates strings
    expect(add('a', 1)).toBe('a1');
    expect(add(1, '2')).toBe('12');
  });

  it('returns NaN for undefined input', () => {
    expect(add(undefined, 1)).toBeNaN();
  });
});
