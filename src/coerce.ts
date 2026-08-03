import { PaylinkError } from './errors';

/**
 * Canonical value → string coercion used for BOTH the signature concatenation
 * and the JSON request body. Deriving both from this single function guarantees
 * the bytes we sign are exactly the bytes we send, so the server (which
 * re-stringifies the decoded JSON when it rebuilds the signature) always agrees.
 *
 * `null`/`undefined` become an empty string — this matches PHP's `implode`,
 * which renders null as `''` (relevant for webhook fields such as a null
 * `message`). For request bodies, absent optional fields are dropped *before*
 * reaching this function, so they never contribute an empty string.
 */
export function coerceToString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new PaylinkError(`Cannot serialize non-finite number: ${value}`);
    }

    return String(value);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  throw new PaylinkError(`Cannot serialize value of type ${typeof value}.`);
}
