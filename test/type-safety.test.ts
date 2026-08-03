import { describe, expect, it } from 'vitest';
import type { EndpointSpec } from '../src/internal/fieldOrders';
import { buildSignedBody } from '../src/internal/sign-request';
import type { CreateInvoiceParams, InvoiceRef } from '../src/types';

/**
 * Compile-time regression tests. These assert that the field registry is
 * type-linked to the params interfaces, which is the guarantee that stops a
 * rename on a params type from silently breaking a signature.
 *
 * `tsc --noEmit` covers `test/`, so a `@ts-expect-error` that stops erroring
 * fails the build — meaning the protection itself is under test, not just
 * assumed.
 */
describe('field registry type-linking', () => {
  it('rejects an sdk key that does not exist on the params type', () => {
    const spec: EndpointSpec<CreateInvoiceParams> = {
      method: 'POST',
      path: '/api/v2/integration/init',
      fields: [
        // @ts-expect-error 'orderTitel' is a typo — not a key of CreateInvoiceParams
        { sdk: 'orderTitel', wire: 'order_title' },
      ],
    };

    expect(spec.fields).toHaveLength(1);
  });

  it('rejects a params object that does not match the spec', () => {
    const spec: EndpointSpec<InvoiceRef> = {
      method: 'POST',
      path: '/api/integration/void',
      fields: [{ sdk: 'invoiceId', wire: 'invoice_id' }],
    };

    // @ts-expect-error a CreateInvoiceParams-shaped object is not an InvoiceRef
    buildSignedBody(spec, { firstName: 'John' }, 'pub', 'secret');

    expect(spec.path).toBe('/api/integration/void');
  });

  it('still accepts correct keys', () => {
    const spec: EndpointSpec<CreateInvoiceParams> = {
      method: 'POST',
      path: '/api/v2/integration/init',
      fields: [
        { sdk: 'orderTitle', wire: 'order_title' },
        { sdk: 'paymentMode', wire: 'payment_mode', signed: false },
      ],
    };

    const body = buildSignedBody(
      spec,
      {
        firstName: 'John',
        lastName: 'Doe',
        email: 'j@x.com',
        orderTitle: 'Gold',
        orderAmount: '10.00',
        currency: 'USD',
      },
      'pub',
      'secret',
    );

    expect(body.order_title).toBe('Gold');
    expect(body.signature).toBeTruthy();
  });
});
