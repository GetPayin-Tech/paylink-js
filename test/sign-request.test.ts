import { describe, expect, it } from 'vitest';
import {
  CARD_CHARGE,
  CARD_REVOKE,
  CARD_TOKENIZE,
  INVOICE_CREATE,
  PAYMENT_CHECK_STATUS,
  PAYMENT_REFUND,
  PAYMENT_REVERSE_AUTHORIZATION,
  PAYMENT_SETTLE,
  PAYMENT_VOID,
  RECURRING_CREATE,
  VCC_CHARGE,
} from '../src/internal/fieldOrders';
import type { EndpointSpec } from '../src/internal/fieldOrders';
import { buildSignedBody } from '../src/internal/sign-request';
import golden from './fixtures/golden-signatures.json';

/**
 * The golden suite drives specs dynamically from a JSON fixture, so it needs a
 * type-erased view of EndpointSpec. `any` is deliberate: `EndpointSpec<P>` is
 * contravariant in P (via `keyof P`), so no concrete params type is assignable
 * to a widened `Record<string, unknown>` form. Erasure is confined to this
 * harness — production call sites are fully checked.
 */
type AnySpec = EndpointSpec<any>;

const SPECS: Record<string, AnySpec> = {
  INVOICE_CREATE,
  PAYMENT_VOID,
  PAYMENT_REFUND,
  PAYMENT_SETTLE,
  PAYMENT_REVERSE_AUTHORIZATION,
  PAYMENT_CHECK_STATUS,
  VCC_CHARGE,
  CARD_TOKENIZE,
  CARD_CHARGE,
  CARD_REVOKE,
  RECURRING_CREATE,
};

describe('buildSignedBody — golden parity with the server', () => {
  for (const testCase of golden.cases) {
    const spec = SPECS[testCase.endpoint];

    if (!spec) {
      continue;
    }

    it(`signs "${testCase.name}" identically to PHP`, () => {
      const body = buildSignedBody(
        spec,
        testCase.input as Record<string, unknown>,
        'pub_token',
        golden.hashToken,
      );

      expect(body.signature).toBe(testCase.expected);
      expect(body.token).toBe('pub_token');
    });
  }
});

describe('buildSignedBody — body construction rules', () => {
  const create = (spec: AnySpec, input: Record<string, unknown>) =>
    buildSignedBody(spec, input, 'pub_token', golden.hashToken);

  it('maps camelCase to snake_case wire keys', () => {
    const body = create(INVOICE_CREATE, {
      firstName: 'John',
      lastName: 'Doe',
      email: 'j@x.com',
      orderTitle: 'T',
      orderAmount: 10,
      currency: 'USD',
      redirectionUrl: 'https://x.com/r',
    });

    expect(body.first_name).toBe('John');
    expect(body.order_title).toBe('T');
    expect(body.redirection_url).toBe('https://x.com/r');
  });

  it('skips absent optional fields entirely', () => {
    const body = create(INVOICE_CREATE, {
      firstName: 'Jane',
      lastName: 'Roe',
      email: 'jane@x.com',
      orderTitle: 'Basic',
      orderAmount: '100.00',
      currency: 'EGP',
    });

    expect(body).not.toHaveProperty('address');
    expect(body).not.toHaveProperty('city');
    expect(body).not.toHaveProperty('order_details');
    expect(Object.keys(body).sort()).toEqual(
      [
        'currency',
        'email',
        'first_name',
        'last_name',
        'order_amount',
        'order_title',
        'signature',
        'token',
      ].sort(),
    );
  });

  it('includes an explicitly empty string (only undefined/null are skipped)', () => {
    const body = create(INVOICE_CREATE, {
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
      orderTitle: 'T',
      orderAmount: 1,
      address: '',
      currency: 'USD',
    });

    expect(body).toHaveProperty('address', '');
  });

  it('sends payment_mode in the body but excludes it from the signature', () => {
    const withMode = create(INVOICE_CREATE, {
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
      orderTitle: 'T',
      orderAmount: 1,
      currency: 'USD',
      paymentMode: 'authorize',
    });
    const withoutMode = create(INVOICE_CREATE, {
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
      orderTitle: 'T',
      orderAmount: 1,
      currency: 'USD',
    });

    expect(withMode.payment_mode).toBe('authorize');
    expect(withMode.signature).toBe(withoutMode.signature);
  });

  it('appends the US state block (us_state, postal_code) after city', () => {
    const body = create(VCC_CHARGE, {
      firstName: 'S',
      lastName: 'S',
      currencyId: 1,
      price: 1,
      product: 'p',
      cardNumber: '4111111111111111',
      cardExpiryMonth: '12',
      cardExpiryYear: '2030',
      country: 'US',
      address: 'a',
      city: 'c',
      usState: 'NY',
      postalCode: '10001',
    });

    expect(body.us_state).toBe('NY');
    expect(body.postal_code).toBe('10001');
    expect(body).not.toHaveProperty('canada_state');
  });

  it('appends the CA state block (canada_state, postal_code)', () => {
    const body = create(CARD_TOKENIZE, {
      firstName: 'M',
      lastName: 'T',
      cardNumber: '4111111111111111',
      cardExpiryMonth: '06',
      cardExpiryYear: '2032',
      country: 'CA',
      address: 'a',
      city: 'c',
      canadaState: 'ON',
      postalCode: 'M5H 2N2',
    });

    expect(body.canada_state).toBe('ON');
    expect(body.postal_code).toBe('M5H 2N2');
    expect(body).not.toHaveProperty('us_state');
  });

  it('omits the state block and any stray state fields for other countries', () => {
    const body = create(VCC_CHARGE, {
      firstName: 'A',
      lastName: 'H',
      currencyId: 2,
      price: 1,
      product: 'p',
      cardNumber: '4111111111111111',
      cardExpiryMonth: '01',
      cardExpiryYear: '2031',
      country: 'EG',
      address: 'a',
      city: 'c',
      usState: 'SHOULD_BE_IGNORED',
      postalCode: 'SHOULD_BE_IGNORED',
    });

    expect(body).not.toHaveProperty('us_state');
    expect(body).not.toHaveProperty('canada_state');
    expect(body).not.toHaveProperty('postal_code');
  });

  it('revoke signs only the card_token', () => {
    const body = create(CARD_REVOKE, { cardToken: 'tok_xyz' });

    expect(body.card_token).toBe('tok_xyz');
    expect(Object.keys(body).sort()).toEqual(['card_token', 'signature', 'token'].sort());
  });
});
