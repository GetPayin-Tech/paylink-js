/** A monetary/numeric value. Pass a string to control the exact wire form. */
export type Numeric = number | string;

/**
 * A string union that still accepts any string, giving editor autocomplete for
 * the common values without rejecting others the API may accept.
 */
export type CurrencyCode = 'EGP' | 'USD' | 'EUR' | (string & {});

export type CadenceInterval = 'day' | 'week' | 'month' | 'year';

export type StoredCredentialInitiator = 'merchant' | 'customer';

/**
 * Per-call overrides accepted by mutating resource methods. `idempotencyKey` is
 * sent as the `Idempotency-Key` header (honored on refund and recurring create);
 * `signal` is an abort signal combined with the client timeout.
 */
export interface RequestOverrides {
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/** Billing address fields; `usState`/`canadaState`/`postalCode` apply to US/CA. */
export interface BillingAddress {
  country: string;
  address: string;
  city: string;
  usState?: string;
  canadaState?: string;
  postalCode?: string;
}

/**
 * Parameters for `invoices.create`. `redirectionUrl` and `webhookUrl` must be
 * HTTPS URLs on the integration's registered domain; `paymentMode` is an
 * optional passthrough that is sent to the API but excluded from the signature.
 */
export interface CreateInvoiceParams {
  firstName: string;
  lastName: string;
  email: string;
  orderTitle: string;
  orderAmount: Numeric;
  currency: CurrencyCode;
  address?: string;
  city?: string;
  country?: string;
  state?: string;
  redirectionUrl?: string;
  webhookUrl?: string;
  orderDetails?: string;
  paymentMode?: string;
}

export interface CreateInvoiceResult {
  checkoutUrl: string;
  invoiceId: number;
  expiresAt: string;
}

export interface InvoiceRef {
  invoiceId: Numeric;
}

export interface AmountParams extends InvoiceRef {
  amount: Numeric;
}

export interface PaymentResult {
  invoiceId: number;
  paidStatus: string;
  authCode: string | null;
}

export interface RefundResult extends PaymentResult {
  refundAmount: number | null;
}

export interface VccChargeParams extends BillingAddress {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  currencyId: Numeric;
  price: Numeric;
  product: string;
  referenceNumber?: string;
  cardNumber: string;
  cardExpiryMonth: Numeric;
  cardExpiryYear: Numeric;
  cardCvv?: string;
}

export interface VccChargeResult {
  invoiceId: number;
  invoiceNumber: string;
  amount: number;
  currency: string;
  paidStatus: string;
}

export interface TokenizeCardParams extends BillingAddress {
  firstName: string;
  lastName: string;
  email?: string;
  customerReference?: string;
  externalReference?: string;
  cardNumber: string;
  cardExpiryMonth: Numeric;
  cardExpiryYear: Numeric;
  cardCvv?: string;
}

export interface TokenizeCardResult {
  token: string;
  card: {
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
  };
  status: string;
}

export interface ChargeTokenParams extends BillingAddress {
  cardToken: string;
  initiator: StoredCredentialInitiator;
  firstName: string;
  lastName: string;
  email?: string;
  currency: CurrencyCode;
  price: Numeric;
  product: string;
  referenceNumber?: string;
}

export interface ChargeTokenResult {
  invoiceId: number;
  invoiceNumber: string;
  amount: number;
  currency: string;
  paidStatus: string;
  cardToken: string;
}

export interface RevokeTokenParams {
  cardToken: string;
}

export interface RevokeTokenResult {
  message: string;
}

/**
 * Parameters for `recurring.create`. `endDate` is an ISO date (YYYY-MM-DD) that
 * must be after today.
 */
export interface CreateRecurringParams {
  firstName: string;
  lastName: string;
  email: string;
  orderTitle: string;
  orderAmount: Numeric;
  currency: CurrencyCode;
  cadenceInterval: CadenceInterval;
  cadenceCount: Numeric;
  totalCycles?: Numeric;
  endDate?: string;
  consentText: string;
  externalReference?: string;
  redirectionUrl?: string;
  webhookUrl?: string;
}

export interface CreateRecurringResult {
  checkoutUrl: string;
  mandateId: string;
  invoiceId: number;
  expiresAt: string;
}

export interface MandateStatusResult {
  mandateId: string;
  status: string;
  amount: number;
  completedCycles: number;
  totalCycles: number | null;
  nextChargeAt: string | null;
}

export interface CancelMandateResult {
  cancelled: boolean;
  status: string;
}

export interface PauseMandateResult {
  paused: boolean;
  status: string;
}

export interface ResumeMandateResult {
  resumed: boolean;
  status: string;
}

/** Every webhook event type PayLink can deliver. */
export const WebhookEventType = {
  InvoicePaid: 'invoice.paid',
  InvoiceNotPaid: 'invoice.not_paid',
  InvoiceVoided: 'invoice.voided',
  InvoiceRefunded: 'invoice.refunded',
  InvoiceAuthorizationReversed: 'invoice.authorization_reversed',
  InvoiceAuthorized: 'invoice.authorized',
  SubscriptionActivated: 'subscription.activated',
  SubscriptionCharged: 'subscription.charged',
  SubscriptionPaymentFailed: 'subscription.payment_failed',
  SubscriptionSuspended: 'subscription.suspended',
  SubscriptionCancelled: 'subscription.cancelled',
  SubscriptionCompleted: 'subscription.completed',
  InstallmentPlanActivated: 'installment.plan_activated',
  InstallmentCharged: 'installment.charged',
  InstallmentPaymentFailed: 'installment.payment_failed',
  InstallmentPlanSuspended: 'installment.plan_suspended',
  InstallmentPlanCompleted: 'installment.plan_completed',
  VccPaymentSuccess: 'vcc.payment_success',
  VccPaymentFailed: 'vcc.payment_failed',
  CardTokenChargeSucceeded: 'card_token.charge_succeeded',
  CardTokenChargeFailed: 'card_token.charge_failed',
} as const;

export type WebhookEventName = (typeof WebhookEventType)[keyof typeof WebhookEventType];

/** The raw webhook body as delivered by PayLink (snake_case JSON). */
export interface WebhookPayload {
  event: string;
  event_triggered_at?: string;
  timezone?: string;
  success: number;
  invoice_id?: number;
  invoice_status?: string;
  message?: string | null;
  auth_code?: string | null;
  mandate_id?: string;
  external_reference?: string;
  subscription_status?: string;
  signature?: string;
  [key: string]: unknown;
}

/** A verified webhook event with camelCase fields; `raw` holds the full body. */
export interface WebhookEvent {
  event: WebhookEventName | string;
  eventTriggeredAt?: string;
  timezone?: string;
  success: boolean;
  invoiceId?: number;
  invoiceStatus?: string;
  message?: string | null;
  authCode?: string | null;
  mandateId?: string;
  externalReference?: string;
  subscriptionStatus?: string;
  raw: WebhookPayload;
}
