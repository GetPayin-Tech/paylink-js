import type { ResolvedConfig } from '../config';
import { execute } from '../http';
import { INVOICE_CREATE } from '../internal/fieldOrders';
import { buildSignedBody } from '../internal/sign-request';
import type { CreateInvoiceParams, CreateInvoiceResult, RequestOverrides } from '../types';

interface RawCheckout {
  checkout_url: string;
  invoice_id: number;
  expires_at: string;
}

export class Invoices {
  constructor(private readonly config: ResolvedConfig) {}

  /**
   * Create an invoice and return a temporary signed checkout URL
   * (`POST /api/v2/integration/init`). Redirect the payer to `checkoutUrl`.
   */
  async create(params: CreateInvoiceParams, overrides?: RequestOverrides): Promise<CreateInvoiceResult> {
    const body = buildSignedBody(
      INVOICE_CREATE,
      params as unknown as Record<string, unknown>,
      this.config.publicToken,
      this.config.hashToken,
    );

    const data = await execute<RawCheckout>(this.config, {
      method: 'POST',
      path: INVOICE_CREATE.path,
      body,
      idempotencyKey: overrides?.idempotencyKey,
      signal: overrides?.signal,
    });

    return {
      checkoutUrl: data.checkout_url,
      invoiceId: data.invoice_id,
      expiresAt: String(data.expires_at),
    };
  }
}
