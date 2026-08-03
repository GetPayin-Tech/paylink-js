import { describe, expect, it } from 'vitest';
import { PaylinkClient } from '../src/client';
import { PaylinkApiError } from '../src/errors';
import { buildSignature } from '../src/signature';
import { bodyOf, fakeFetch } from './helpers';

const HASH = 'test_hash_token_abc123';

function client(data: unknown): { paylink: PaylinkClient; calls: ReturnType<typeof fakeFetch>['calls'] } {
  const { fetch, calls } = fakeFetch(() => ({ json: data }));
  const paylink = new PaylinkClient({ publicToken: 'pub_token', hashToken: HASH, fetch });

  return { paylink, calls };
}

describe('invoices.create', () => {
  it('POSTs to v2 init with a signed body and maps the checkout result', async () => {
    const { paylink, calls } = client({
      success: true,
      data: { checkout_url: 'https://pay/checkout', invoice_id: 42, expires_at: '2026-08-03T11:00:00Z' },
    });

    const result = await paylink.invoices.create({
      firstName: 'John',
      lastName: 'Doe',
      email: 'j@x.com',
      orderTitle: 'Plan',
      orderAmount: 100,
      currency: 'USD',
    });

    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('https://pay.getpayin.com/api/v2/integration/init');
    const body = bodyOf(calls[0]!);
    expect(body.token).toBe('pub_token');
    expect(body.first_name).toBe('John');
    expect(body).toHaveProperty('signature');
    expect(result).toEqual({ checkoutUrl: 'https://pay/checkout', invoiceId: 42, expiresAt: '2026-08-03T11:00:00Z' });
  });
});

describe('payments', () => {
  it('refund forwards the Idempotency-Key and maps refundAmount', async () => {
    const { paylink, calls } = client({
      success: true,
      data: { invoice_id: 7, paid_status: 'refunded', auth_code: 'A1', refund_amount: 10.5 },
    });

    const result = await paylink.payments.refund({ invoiceId: 7, amount: '10.50' }, { idempotencyKey: 'idem-1' });

    expect(calls[0]?.url).toBe('https://pay.getpayin.com/api/integration/refund');
    expect(calls[0]?.headers['Idempotency-Key']).toBe('idem-1');
    expect(bodyOf(calls[0]!).amount).toBe('10.50');
    expect(result).toEqual({ invoiceId: 7, paidStatus: 'refunded', authCode: 'A1', refundAmount: 10.5 });
  });

  it('void maps a null auth_code', async () => {
    const { paylink } = client({ success: true, data: { invoice_id: 7, paid_status: 'voided', auth_code: null } });
    const result = await paylink.payments.void({ invoiceId: 7 });

    expect(result).toEqual({ invoiceId: 7, paidStatus: 'voided', authCode: null });
  });
});

describe('cards', () => {
  it('tokenize maps the nested card object to camelCase', async () => {
    const { paylink, calls } = client({
      success: true,
      data: { token: 'tok_1', card: { brand: 'visa', last4: '1111', exp_month: 12, exp_year: 2030 }, status: 'active' },
    });

    const result = await paylink.cards.tokenize({
      firstName: 'A',
      lastName: 'B',
      cardNumber: '4111111111111111',
      cardExpiryMonth: '12',
      cardExpiryYear: '2030',
      country: 'EG',
      address: 'a',
      city: 'c',
    });

    expect(calls[0]?.url).toBe('https://pay.getpayin.com/api/v2/integration/tokens/card');
    expect(result.token).toBe('tok_1');
    expect(result.card).toEqual({ brand: 'visa', last4: '1111', expMonth: 12, expYear: 2030 });
  });

  it('revoke returns the message even though the envelope has no data', async () => {
    const { paylink } = client({ success: true, message: 'Token revoked.' });
    const result = await paylink.cards.revoke({ cardToken: 'tok_1' });

    expect(result).toEqual({ message: 'Token revoked.' });
  });

  it('tokenize rejects with a forbidden error when card tokenization is not enabled', async () => {
    const { fetch } = fakeFetch(() => ({
      status: 403,
      json: { success: false, message: 'Card tokenization is not enabled for your account. Please contact the business team.' },
    }));
    const paylink = new PaylinkClient({ publicToken: 'pub_token', hashToken: HASH, fetch });

    const error = (await paylink.cards
      .tokenize({
        firstName: 'A',
        lastName: 'B',
        cardNumber: '4111111111111111',
        cardExpiryMonth: '12',
        cardExpiryYear: '2030',
        country: 'EG',
        address: 'a',
        city: 'c',
      })
      .catch((e) => e)) as PaylinkApiError;

    expect(error).toBeInstanceOf(PaylinkApiError);
    expect(error.isForbidden).toBe(true);
  });
});

describe('recurring', () => {
  it('status uses a GET with token+signature in the query (mandate-uid signature)', async () => {
    const { paylink, calls } = client({
      success: true,
      data: {
        mandate_id: 'M1',
        status: 'active',
        amount: 250,
        completed_cycles: 2,
        total_cycles: 12,
        next_charge_at: '2026-09-01',
      },
    });

    const result = await paylink.recurring.status('M1');

    const expectedSig = buildSignature(['M1'], HASH);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url).toContain('/api/v2/integration/recurring/M1?');
    expect(calls[0]?.url).toContain(`signature=${encodeURIComponent(expectedSig)}`);
    expect(calls[0]?.body).toBeUndefined();
    expect(result).toMatchObject({ mandateId: 'M1', completedCycles: 2, totalCycles: 12, nextChargeAt: '2026-09-01' });
  });

  it('cancel POSTs to the action path with a mandate-uid signature body', async () => {
    const { paylink, calls } = client({ success: true, data: { cancelled: true, status: 'cancelled' } });

    const result = await paylink.recurring.cancel('M1');

    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('https://pay.getpayin.com/api/v2/integration/recurring/M1/cancel');
    expect(bodyOf(calls[0]!)).toEqual({ token: 'pub_token', signature: buildSignature(['M1'], HASH) });
    expect(result).toEqual({ cancelled: true, status: 'cancelled' });
  });
});

describe('vcc.charge', () => {
  it('maps the charge result', async () => {
    const { paylink, calls } = client({
      success: true,
      data: { invoice_id: 9, invoice_number: 'INV-9', amount: 100, currency: 'USD', paid_status: 'PAID' },
    });

    const result = await paylink.vcc.charge({
      firstName: 'S',
      lastName: 'S',
      currencyId: 1,
      price: 100,
      product: 'p',
      cardNumber: '4111111111111111',
      cardExpiryMonth: '12',
      cardExpiryYear: '2030',
      country: 'EG',
      address: 'a',
      city: 'c',
    });

    expect(calls[0]?.url).toBe('https://pay.getpayin.com/api/v2/integration/vcc/charge');
    expect(result).toEqual({ invoiceId: 9, invoiceNumber: 'INV-9', amount: 100, currency: 'USD', paidStatus: 'PAID' });
  });
});
