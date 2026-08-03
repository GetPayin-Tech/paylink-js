import { coerceToString } from '../coerce';
import { buildSignature } from '../signature';
import type { EndpointSpec } from './fieldOrders';

/**
 * Turn a camelCase SDK request object into the signed wire body for an
 * {@link EndpointSpec}. The returned object is ready to POST as JSON: it
 * contains the endpoint's fields (snake_case), the public `token`, and the
 * computed `signature`.
 *
 * The signature is built from the same coerced strings that go into the body,
 * in the spec's order, skipping fields the caller did not provide — exactly how
 * the server reconstructs it from `Arr::except($request->validated(), ...)`.
 */
export function buildSignedBody(
  spec: EndpointSpec,
  input: Record<string, unknown>,
  publicToken: string,
  hashToken: string,
): Record<string, string> {
  const signedValues: string[] = [];
  const body: Record<string, string> = {};

  const append = (sdkKey: string, wireKey: string, signed: boolean): void => {
    const value = input[sdkKey];

    if (value === undefined || value === null) {
      return;
    }

    const stringValue = coerceToString(value);
    body[wireKey] = stringValue;

    if (signed) {
      signedValues.push(stringValue);
    }
  };

  for (const field of spec.fields) {
    append(field.sdk, field.wire, field.signed !== false);
  }

  if (spec.countryStateBlock) {
    appendCountryStateBlock(input, append);
  }

  const signature = buildSignature(signedValues, hashToken);

  return { ...body, token: publicToken, signature };
}

function appendCountryStateBlock(
  input: Record<string, unknown>,
  append: (sdkKey: string, wireKey: string, signed: boolean) => void,
): void {
  const country = typeof input.country === 'string' ? input.country : undefined;

  if (country === 'US') {
    append('usState', 'us_state', true);
    append('postalCode', 'postal_code', true);

    return;
  }

  if (country === 'CA') {
    append('canadaState', 'canada_state', true);
    append('postalCode', 'postal_code', true);
  }
}
