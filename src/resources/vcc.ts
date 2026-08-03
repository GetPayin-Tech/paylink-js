import type { ResolvedConfig } from '../config';
import { execute } from '../http';
import { VCC_CHARGE } from '../internal/fieldOrders';
import { buildSignedBody } from '../internal/sign-request';
import type { RequestOverrides, VccChargeParams, VccChargeResult } from '../types';

interface RawVccCharge {
  invoice_id: number;
  invoice_number: string;
  amount: number;
  currency: string;
  paid_status: string;
}

export class Vcc {
  constructor(private readonly config: ResolvedConfig) {}

  /**
   * Server-to-server card charge with raw card data
   * (`POST /api/v2/integration/vcc/charge`). Requires PCI scope to send PAN/CVV.
   */
  async charge(params: VccChargeParams, overrides?: RequestOverrides): Promise<VccChargeResult> {
    const body = buildSignedBody(
      VCC_CHARGE,
      params as unknown as Record<string, unknown>,
      this.config.publicToken,
      this.config.hashToken,
    );

    const data = await execute<RawVccCharge>(this.config, {
      method: 'POST',
      path: VCC_CHARGE.path,
      body,
      idempotencyKey: overrides?.idempotencyKey,
      signal: overrides?.signal,
    });

    return {
      invoiceId: data.invoice_id,
      invoiceNumber: data.invoice_number,
      amount: data.amount,
      currency: data.currency,
      paidStatus: data.paid_status,
    };
  }
}
