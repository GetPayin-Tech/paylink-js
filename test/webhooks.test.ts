import { describe, expect, it } from 'vitest';
import { PaylinkError, PaylinkSignatureError } from '../src/errors';
import { WebhookEventType } from '../src/types';
import type { WebhookPayload } from '../src/types';
import { Webhooks } from '../src/webhooks';
import { fakeConfig } from './helpers';
import golden from './fixtures/golden-signatures.json';

const webhooks = new Webhooks(fakeConfig());
const webhookCases = golden.cases.filter((c) => c.endpoint === 'WEBHOOK');

function payloadFor(name: string): WebhookPayload {
  const testCase = webhookCases.find((c) => c.name.includes(name));
  if (!testCase) {
    throw new Error(`missing webhook fixture: ${name}`);
  }

  return { ...(testCase.input as WebhookPayload), signature: testCase.expected };
}

describe('Webhooks.verify', () => {
  it('verifies every webhook golden vector', () => {
    for (const testCase of webhookCases) {
      const payload = { ...(testCase.input as WebhookPayload), signature: testCase.expected };
      expect(() => webhooks.verify(payload), testCase.name).not.toThrow();
    }
  });

  it('returns a camelCase event with a boolean success and the raw body', () => {
    const event = webhooks.verify(payloadFor('subscription.charged'));

    expect(event.event).toBe('subscription.charged');
    expect(event.success).toBe(true);
    expect(event.invoiceId).toBe(555);
    expect(event.mandateId).toBe('M-1');
    expect(event.subscriptionStatus).toBe('active');
    expect(event.raw.event).toBe('subscription.charged');
  });

  it('verifies a payload delivered as a JSON string', () => {
    const event = webhooks.verify(JSON.stringify(payloadFor('invoice.paid')));

    expect(event.invoiceId).toBe(123);
    expect(event.message).toBeNull();
  });

  it('throws when the signature does not match a tampered field', () => {
    const payload = payloadFor('invoice.paid');
    payload.invoice_status = 'VOIDED';

    expect(() => webhooks.verify(payload)).toThrow(PaylinkSignatureError);
  });

  it('throws when the signature is missing', () => {
    const payload = payloadFor('invoice.paid');
    delete payload.signature;

    expect(() => webhooks.verify(payload)).toThrow(PaylinkSignatureError);
  });

  it('throws when verified with the wrong hashToken', () => {
    expect(() => webhooks.verify(payloadFor('invoice.paid'), { hashToken: 'wrong' })).toThrow(
      PaylinkSignatureError,
    );
  });

  it('throws PaylinkError on non-JSON string input', () => {
    expect(() => webhooks.verify('not json{')).toThrow(PaylinkError);
  });

  it('rejects an added optional field absent from the signed invoice.paid vector', () => {
    const payload = payloadFor('invoice.paid');
    payload.mandate_id = 'sneaky';

    expect(() => webhooks.verify(payload)).toThrow(PaylinkSignatureError);
  });
});

describe('Webhooks.isValid', () => {
  it('returns true for a valid payload and false for a tampered one', () => {
    expect(webhooks.isValid(payloadFor('invoice.paid'))).toBe(true);

    const tampered = payloadFor('invoice.paid');
    tampered.invoice_id = 999;

    expect(webhooks.isValid(tampered)).toBe(false);
  });
});

describe('WebhookEventType', () => {
  it('is a runtime value whose entries match the wire event names', () => {
    expect(WebhookEventType.InvoicePaid).toBe('invoice.paid');
    expect(WebhookEventType.SubscriptionCharged).toBe('subscription.charged');
    expect(WebhookEventType.CardTokenChargeFailed).toBe('card_token.charge_failed');

    const names = Object.values(WebhookEventType);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });

  it('covers every event name the golden webhook fixtures use', () => {
    const known = new Set<string>(Object.values(WebhookEventType));

    for (const testCase of webhookCases) {
      expect(known, testCase.name).toContain((testCase.input as WebhookPayload).event);
    }
  });
});
