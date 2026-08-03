import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config';
import { PaylinkConfigError } from '../src/errors';

const base = { publicToken: 'pub', hashToken: 'secret', fetch: async () => ({}) as never };

describe('resolveConfig', () => {
  it('applies defaults for baseUrl and timeout', () => {
    const resolved = resolveConfig(base);

    expect(resolved.baseUrl).toBe('https://pay.getpayin.com');
    expect(resolved.timeoutMs).toBe(30_000);
  });

  it('strips trailing slashes from a custom baseUrl', () => {
    expect(resolveConfig({ ...base, baseUrl: 'https://sandbox.example.com//' }).baseUrl).toBe(
      'https://sandbox.example.com',
    );
  });

  it('rejects a missing or empty publicToken', () => {
    expect(() => resolveConfig({ ...base, publicToken: '' })).toThrow(PaylinkConfigError);
    expect(() => resolveConfig({ ...base, publicToken: '   ' })).toThrow(PaylinkConfigError);
  });

  it('rejects a missing hashToken', () => {
    expect(() => resolveConfig({ ...base, hashToken: '' })).toThrow(PaylinkConfigError);
  });

  it('rejects a non-positive timeout', () => {
    expect(() => resolveConfig({ ...base, timeoutMs: 0 })).toThrow(PaylinkConfigError);
    expect(() => resolveConfig({ ...base, timeoutMs: -1 })).toThrow(PaylinkConfigError);
  });
});
