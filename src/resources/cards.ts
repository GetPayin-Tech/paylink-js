import type { ResolvedConfig } from '../config';
import { execute } from '../http';
import { CARD_CHARGE, CARD_REVOKE, CARD_TOKENIZE } from '../internal/fieldOrders';
import { buildSignedBody } from '../internal/sign-request';
import type {
  ChargeTokenParams,
  ChargeTokenResult,
  RequestOverrides,
  RevokeTokenResult,
  TokenizeCardParams,
  TokenizeCardResult,
} from '../types';

interface RawTokenize {
  token: string;
  card: { brand: string | null; last4: string | null; exp_month: number | null; exp_year: number | null };
  status: string;
}

interface RawTokenCharge {
  invoice_id: number;
  invoice_number: string;
  amount: number;
  currency: string;
  paid_status: string;
  card_token: string;
}

interface RawRevoke {
  message?: string;
}

export class Cards {
  constructor(private readonly config: ResolvedConfig) {}

  /** Vault a card and return a reusable token (`POST /api/v2/integration/tokens/card`). */
  async tokenize(params: TokenizeCardParams, overrides?: RequestOverrides): Promise<TokenizeCardResult> {
    const data = await this.send<RawTokenize>(CARD_TOKENIZE, params, overrides);

    return {
      token: data.token,
      card: {
        brand: data.card?.brand ?? null,
        last4: data.card?.last4 ?? null,
        expMonth: data.card?.exp_month ?? null,
        expYear: data.card?.exp_year ?? null,
      },
      status: data.status,
    };
  }

  /** Charge a previously vaulted card (`POST /api/v2/integration/tokens/charge`). */
  async charge(params: ChargeTokenParams, overrides?: RequestOverrides): Promise<ChargeTokenResult> {
    const data = await this.send<RawTokenCharge>(CARD_CHARGE, params, overrides);

    return {
      invoiceId: data.invoice_id,
      invoiceNumber: data.invoice_number,
      amount: data.amount,
      currency: data.currency,
      paidStatus: data.paid_status,
      cardToken: data.card_token,
    };
  }

  /** Revoke a vaulted card token (`POST /api/v2/integration/tokens/revoke`). Idempotent. */
  async revoke(params: { cardToken: string }, overrides?: RequestOverrides): Promise<RevokeTokenResult> {
    const data = await this.send<RawRevoke>(CARD_REVOKE, params, overrides);

    return { message: data.message ?? 'Token revoked.' };
  }

  private async send<T>(
    spec: (typeof CARD_TOKENIZE) | (typeof CARD_CHARGE) | (typeof CARD_REVOKE),
    params: object,
    overrides?: RequestOverrides,
  ): Promise<T> {
    const body = buildSignedBody(
      spec,
      params as Record<string, unknown>,
      this.config.publicToken,
      this.config.hashToken,
    );

    return execute<T>(this.config, {
      method: 'POST',
      path: spec.path,
      body,
      idempotencyKey: overrides?.idempotencyKey,
      signal: overrides?.signal,
    });
  }
}
