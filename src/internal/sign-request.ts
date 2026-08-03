import { coerceToString } from '../coerce';
import { buildSignature } from '../signature';
import type { BillingAddress } from '../types';
import type { EndpointSpec } from './fieldOrders';

type Append = (value: unknown, wireKey: string, signed: boolean) => void;

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
export function buildSignedBody<P extends object>(
  spec: EndpointSpec<P>,
  input: P,
  publicToken: string,
  hashToken: string,
): Record<string, string> {
  const signedValues: string[] = [];
  const body: Record<string, string> = {};

  const append: Append = (value, wireKey, signed) => {
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
    append(input[field.sdk], field.wire, field.signed !== false);
  }

  if (spec.countryStateBlock) {
    appendCountryStateBlock(input as Partial<BillingAddress>, append);
  }

  const signature = buildSignature(signedValues, hashToken);

  return { ...body, token: publicToken, signature };
}

function appendCountryStateBlock(input: Partial<BillingAddress>, append: Append): void {
  if (input.country === 'US') {
    append(input.usState, 'us_state', true);
    append(input.postalCode, 'postal_code', true);

    return;
  }

  if (input.country === 'CA') {
    append(input.canadaState, 'canada_state', true);
    append(input.postalCode, 'postal_code', true);
  }
}
