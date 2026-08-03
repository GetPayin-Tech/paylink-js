import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Build a PayLink signature: HMAC-SHA256 over the empty-string concatenation of
 * the already-stringified, already-ordered values, base64-encoded. This mirrors
 * `ExternalPaymentIntegration::buildSignatureString()` on the server
 * (`base64_encode(hash_hmac('sha256', implode('', $data), $hashToken, true))`).
 *
 * Callers are responsible for supplying values in the exact wire order and
 * coercing them with {@link coerceToString}.
 */
export function buildSignature(orderedValues: readonly string[], hashToken: string): string {
  const concatenated = orderedValues.join('');

  return createHmac('sha256', hashToken).update(concatenated, 'utf8').digest('base64');
}

/**
 * Constant-time comparison of two signature strings, equivalent to PHP's
 * `hash_equals`. Returns false for length mismatches without leaking timing.
 */
export function signaturesEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return timingSafeEqual(bufferA, bufferB);
}
