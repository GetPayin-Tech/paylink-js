import { describe, expect, it } from 'vitest';
import { coerceToString } from '../src/coerce';
import { PaylinkError } from '../src/errors';

describe('coerceToString', () => {
  it('passes strings through unchanged, including empty', () => {
    expect(coerceToString('hello')).toBe('hello');
    expect(coerceToString('')).toBe('');
    expect(coerceToString('100.00')).toBe('100.00');
  });

  it('stringifies integers and floats', () => {
    expect(coerceToString(250)).toBe('250');
    expect(coerceToString(99.5)).toBe('99.5');
    expect(coerceToString(0)).toBe('0');
  });

  it('renders null and undefined as empty string (matches PHP implode)', () => {
    expect(coerceToString(null)).toBe('');
    expect(coerceToString(undefined)).toBe('');
  });

  it('renders booleans as 1/0', () => {
    expect(coerceToString(true)).toBe('1');
    expect(coerceToString(false)).toBe('0');
  });

  it('stringifies bigint', () => {
    expect(coerceToString(10n)).toBe('10');
  });

  it('throws on non-finite numbers', () => {
    expect(() => coerceToString(Number.NaN)).toThrow(PaylinkError);
    expect(() => coerceToString(Number.POSITIVE_INFINITY)).toThrow(PaylinkError);
  });

  it('throws on unsupported types', () => {
    expect(() => coerceToString({})).toThrow(PaylinkError);
    expect(() => coerceToString([1, 2])).toThrow(PaylinkError);
  });
});
