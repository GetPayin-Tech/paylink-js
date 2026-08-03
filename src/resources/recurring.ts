import type { ResolvedConfig } from '../config';
import { execute } from '../http';
import { RECURRING_CREATE } from '../internal/fieldOrders';
import { buildSignedBody } from '../internal/sign-request';
import { buildSignature } from '../signature';
import type {
  CancelMandateResult,
  CreateRecurringParams,
  CreateRecurringResult,
  MandateStatusResult,
  PauseMandateResult,
  RequestOverrides,
  ResumeMandateResult,
} from '../types';

interface RawRecurringCreate {
  checkout_url: string;
  mandate_id: string;
  invoice_id: number;
  expires_at: string;
}

interface RawMandateStatus {
  mandate_id: string;
  status: string;
  amount: number;
  completed_cycles: number;
  total_cycles: number | null;
  next_charge_at: string | null;
}

export class Recurring {
  constructor(private readonly config: ResolvedConfig) {}

  /**
   * Create a recurring mandate and return a checkout URL for the first
   * (setup) charge (`POST /api/v2/integration/recurring/init`). Pass
   * `idempotencyKey` (or `externalReference`) to make retries safe.
   */
  async create(
    params: CreateRecurringParams,
    overrides?: RequestOverrides,
  ): Promise<CreateRecurringResult> {
    const body = buildSignedBody(
      RECURRING_CREATE,
      params,
      this.config.publicToken,
      this.config.hashToken,
    );

    const data = await execute<RawRecurringCreate>(this.config, {
      method: 'POST',
      path: RECURRING_CREATE.path,
      body,
      idempotencyKey: overrides?.idempotencyKey,
      signal: overrides?.signal,
    });

    return {
      checkoutUrl: data.checkout_url,
      mandateId: data.mandate_id,
      invoiceId: data.invoice_id,
      expiresAt: String(data.expires_at),
    };
  }

  /** Query a mandate's status (`GET /api/v2/integration/recurring/{mandate}`). */
  async status(mandateId: string, overrides?: RequestOverrides): Promise<MandateStatusResult> {
    const data = await execute<RawMandateStatus>(this.config, {
      method: 'GET',
      path: this.mandatePath(mandateId),
      query: { token: this.config.publicToken, signature: this.signMandate(mandateId) },
      signal: overrides?.signal,
    });

    return {
      mandateId: data.mandate_id,
      status: data.status,
      amount: data.amount,
      completedCycles: data.completed_cycles,
      totalCycles: data.total_cycles ?? null,
      nextChargeAt: data.next_charge_at ?? null,
    };
  }

  /** Cancel a mandate (`POST /api/v2/integration/recurring/{mandate}/cancel`). */
  async cancel(mandateId: string, overrides?: RequestOverrides): Promise<CancelMandateResult> {
    return this.action<CancelMandateResult>(mandateId, 'cancel', overrides);
  }

  /** Pause a mandate (`POST /api/v2/integration/recurring/{mandate}/pause`). */
  async pause(mandateId: string, overrides?: RequestOverrides): Promise<PauseMandateResult> {
    return this.action<PauseMandateResult>(mandateId, 'pause', overrides);
  }

  /** Resume a paused mandate (`POST /api/v2/integration/recurring/{mandate}/resume`). */
  async resume(mandateId: string, overrides?: RequestOverrides): Promise<ResumeMandateResult> {
    return this.action<ResumeMandateResult>(mandateId, 'resume', overrides);
  }

  private async action<T>(
    mandateId: string,
    action: string,
    overrides?: RequestOverrides,
  ): Promise<T> {
    return execute<T>(this.config, {
      method: 'POST',
      path: `${this.mandatePath(mandateId)}/${action}`,
      body: { token: this.config.publicToken, signature: this.signMandate(mandateId) },
      signal: overrides?.signal,
    });
  }

  private mandatePath(mandateId: string): string {
    return `/api/v2/integration/recurring/${encodeURIComponent(mandateId)}`;
  }

  private signMandate(mandateId: string): string {
    return buildSignature([mandateId], this.config.hashToken);
  }
}
