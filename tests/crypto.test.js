const crypto = require('crypto');
const { hmacSHA256Hex } = require('../src/utils/crypto');

describe('hmacSHA256Hex', () => {
  it('produces a 64-character hex string', () => {
    const result = hmacSHA256Hex('secret', 'payload');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches the reference crypto implementation', () => {
    const key = 'my-key';
    const payload = 'my-payload';
    const expected = crypto
      .createHmac('sha256', key)
      .update(payload)
      .digest('hex');
    expect(hmacSHA256Hex(key, payload)).toBe(expected);
  });

  it('produces different output for different keys', () => {
    const a = hmacSHA256Hex('key-a', 'same-payload');
    const b = hmacSHA256Hex('key-b', 'same-payload');
    expect(a).not.toBe(b);
  });

  it('produces different output for different payloads', () => {
    const a = hmacSHA256Hex('same-key', 'payload-a');
    const b = hmacSHA256Hex('same-key', 'payload-b');
    expect(a).not.toBe(b);
  });

  it('is deterministic', () => {
    const first = hmacSHA256Hex('key', 'data');
    const second = hmacSHA256Hex('key', 'data');
    expect(first).toBe(second);
  });

  it('handles empty payload', () => {
    const result = hmacSHA256Hex('key', '');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles unicode payload', () => {
    const result = hmacSHA256Hex('key', 'hello world');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });
});
