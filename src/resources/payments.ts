import type { ResolvedConfig } from '../config';
import { execute } from '../http';
import {
  PAYMENT_CHECK_STATUS,
  PAYMENT_REFUND,
  PAYMENT_REVERSE_AUTHORIZATION,
  PAYMENT_SETTLE,
  PAYMENT_VOID,
} from '../internal/fieldOrders';
import type { EndpointSpec } from '../internal/fieldOrders';
import { buildSignedBody } from '../internal/sign-request';
import type {
  AmountParams,
  InvoiceRef,
  PaymentResult,
  RefundResult,
  RequestOverrides,
} from '../types';

interface RawPayment {
  invoice_id: number;
  paid_status: string;
  auth_code: string | null;
}

interface RawRefund extends RawPayment {
  refund_amount: number | null;
}

export class Payments {
  constructor(private readonly config: ResolvedConfig) {}

  /** Void a paid invoice (`POST /api/integration/void`). */
  async void(params: InvoiceRef, overrides?: RequestOverrides): Promise<PaymentResult> {
    return this.mapPayment(await this.send<RawPayment, InvoiceRef>(PAYMENT_VOID, params, overrides));
  }

  /**
   * Refund a paid invoice, full or partial (`POST /api/integration/refund`).
   * Pass `idempotencyKey` to make retries safe.
   */
  async refund(params: AmountParams, overrides?: RequestOverrides): Promise<RefundResult> {
    const data = await this.send<RawRefund, AmountParams>(PAYMENT_REFUND, params, overrides);

    return { ...this.mapPayment(data), refundAmount: data.refund_amount ?? null };
  }

  /** Capture an authorized invoice (`POST /api/integration/settle`). */
  async settle(params: AmountParams, overrides?: RequestOverrides): Promise<PaymentResult> {
    return this.mapPayment(await this.send<RawPayment, AmountParams>(PAYMENT_SETTLE, params, overrides));
  }

  /** Reverse an authorization hold (`POST /api/integration/reverse-authorization`). */
  async reverseAuthorization(params: InvoiceRef, overrides?: RequestOverrides): Promise<PaymentResult> {
    return this.mapPayment(await this.send<RawPayment, InvoiceRef>(PAYMENT_REVERSE_AUTHORIZATION, params, overrides));
  }

  /**
   * Query the current gateway status of an invoice
   * (`POST /api/integration/check-status`). This is a pure read despite being a
   * POST, so it is retried on transient failures.
   */
  async checkStatus(params: InvoiceRef, overrides?: RequestOverrides): Promise<PaymentResult> {
    return this.mapPayment(
      await this.send<RawPayment, InvoiceRef>(PAYMENT_CHECK_STATUS, params, overrides, { replaySafe: true }),
    );
  }

  private async send<T, P extends object>(
    spec: EndpointSpec<P>,
    params: P,
    overrides?: RequestOverrides,
    transport?: { replaySafe?: boolean },
  ): Promise<T> {
    const body = buildSignedBody(spec, params, this.config.publicToken, this.config.hashToken);

    return execute<T>(this.config, {
      method: 'POST',
      path: spec.path,
      body,
      idempotencyKey: overrides?.idempotencyKey,
      signal: overrides?.signal,
      replaySafe: transport?.replaySafe,
    });
  }

  private mapPayment(data: RawPayment): PaymentResult {
    return { invoiceId: data.invoice_id, paidStatus: data.paid_status, authCode: data.auth_code ?? null };
  }
}
