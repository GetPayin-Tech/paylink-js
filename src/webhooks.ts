import { coerceToString } from './coerce';
import type { ResolvedConfig } from './config';
import { PaylinkError, PaylinkSignatureError } from './errors';
import { buildSignature, signaturesEqual } from './signature';
import type { WebhookEvent, WebhookPayload } from './types';

/** Always-signed webhook fields, in concatenation order (null renders as ''). */
const ALWAYS_SIGNED = ['success', 'invoice_id', 'invoice_status', 'message'] as const;

/** Optionally-signed fields, appended in this order only when present. */
const OPTIONAL_SIGNED = ['mandate_id', 'external_reference', 'subscription_status'] as const;

/**
 * Options for {@link Webhooks.verify}. `hashToken` overrides the client's
 * hashToken (e.g. when verifying a webhook for a different integration).
 */
export interface VerifyOptions {
  hashToken?: string;
}

export class Webhooks {
  constructor(private readonly config: ResolvedConfig) {}

  /**
   * Verify an inbound webhook and return the parsed event. Accepts the parsed
   * JSON body or the raw string. Throws {@link PaylinkSignatureError} if the
   * signature is missing or does not match.
   *
   * Note: PayLink webhook signatures carry no timestamp, so this does not
   * protect against replay — pair it with your own idempotency on `invoice_id`.
   */
  verify(payload: WebhookPayload | string, options?: VerifyOptions): WebhookEvent {
    const parsed = this.parse(payload);
    const hashToken = options?.hashToken ?? this.config.hashToken;

    const provided = parsed.signature;

    if (typeof provided !== 'string' || provided === '') {
      throw new PaylinkSignatureError('Webhook payload is missing a signature.');
    }

    if (!signaturesEqual(this.computeSignature(parsed, hashToken), provided)) {
      throw new PaylinkSignatureError();
    }

    return this.toEvent(parsed);
  }

  /** Non-throwing variant of {@link verify}. */
  isValid(payload: WebhookPayload | string, options?: VerifyOptions): boolean {
    try {
      this.verify(payload, options);

      return true;
    } catch (error) {
      if (error instanceof PaylinkSignatureError) {
        return false;
      }

      throw error;
    }
  }

  private computeSignature(payload: WebhookPayload, hashToken: string): string {
    const values: string[] = ALWAYS_SIGNED.map((key) => coerceToString(payload[key]));

    for (const key of OPTIONAL_SIGNED) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        values.push(coerceToString(payload[key]));
      }
    }

    return buildSignature(values, hashToken);
  }

  private parse(payload: WebhookPayload | string): WebhookPayload {
    if (typeof payload !== 'string') {
      return payload;
    }

    try {
      return JSON.parse(payload) as WebhookPayload;
    } catch (error) {
      throw new PaylinkError('Webhook payload is not valid JSON.', { cause: error });
    }
  }

  private toEvent(payload: WebhookPayload): WebhookEvent {
    return {
      event: payload.event,
      eventTriggeredAt: payload.event_triggered_at,
      timezone: payload.timezone,
      success: Number(payload.success) === 1,
      invoiceId: payload.invoice_id,
      invoiceStatus: payload.invoice_status,
      message: payload.message ?? null,
      authCode: payload.auth_code ?? null,
      mandateId: payload.mandate_id,
      externalReference: payload.external_reference,
      subscriptionStatus: payload.subscription_status,
      refundAmount: payload.refund_amount,
      refundCurrency: payload.refund_currency,
      raw: payload,
    };
  }
}
