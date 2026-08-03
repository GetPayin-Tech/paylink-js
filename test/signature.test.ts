import { describe, expect, it } from 'vitest';
import { buildSignature, signaturesEqual } from '../src/signature';
import golden from './fixtures/golden-signatures.json';

describe('buildSignature', () => {
  it('matches the PHP-generated golden vector for every case', () => {
    for (const testCase of golden.cases) {
      expect(buildSignature(testCase.values, golden.hashToken), testCase.name).toBe(
        testCase.expected,
      );
    }
  });

  it('joins with the empty string so positioning does not matter, only concatenation', () => {
    expect(buildSignature(['12', '3'], 'k')).toBe(buildSignature(['1', '23'], 'k'));
  });

  it('produces a base64 string', () => {
    expect(buildSignature(['a'], 'k')).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });
});

describe('signaturesEqual', () => {
  it('returns true for identical strings', () => {
    expect(signaturesEqual('abc123==', 'abc123==')).toBe(true);
  });

  it('returns false for different strings of equal length', () => {
    expect(signaturesEqual('abc', 'abd')).toBe(false);
  });

  it('returns false for different lengths without throwing', () => {
    expect(signaturesEqual('abc', 'abcd')).toBe(false);
  });
});
