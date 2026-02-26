const { isEmail } = require('../src/utils/validate');

describe('isEmail', () => {
  it('accepts a standard email address', () => {
    expect(isEmail('user@example.com')).toBe(true);
  });

  it('accepts email with subdomain', () => {
    expect(isEmail('user@mail.example.co.uk')).toBe(true);
  });

  it('accepts email with plus tag', () => {
    expect(isEmail('user+tag@example.com')).toBe(true);
  });

  it('rejects missing @ sign', () => {
    expect(isEmail('userexample.com')).toBe(false);
  });

  it('rejects missing domain', () => {
    expect(isEmail('user@')).toBe(false);
  });

  it('rejects missing TLD', () => {
    expect(isEmail('user@example')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isEmail('')).toBe(false);
  });

  it('rejects null and undefined', () => {
    expect(isEmail(null)).toBe(false);
    expect(isEmail(undefined)).toBe(false);
  });

  it('rejects non-string types', () => {
    expect(isEmail(123)).toBe(false);
    expect(isEmail({})).toBe(false);
    expect(isEmail([])).toBe(false);
    expect(isEmail(true)).toBe(false);
  });
});
