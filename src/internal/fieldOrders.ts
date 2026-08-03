import type {
  AmountParams,
  ChargeTokenParams,
  CreateInvoiceParams,
  CreateRecurringParams,
  InvoiceRef,
  RevokeTokenParams,
  TokenizeCardParams,
  VccChargeParams,
} from '../types';

/**
 * The signed-field registry. Each entry lists the request fields for one
 * endpoint in the EXACT order the server concatenates them when it rebuilds the
 * HMAC signature (the FormRequest `rules()` order, minus `token`/`signature`,
 * and minus `payment_mode` where noted). Getting this order right is the whole
 * job of the SDK — see the source FormRequests under
 * app/Http/Requests/Application/ExternalPaymentIntegration.
 *
 * Rules encoded here, mirroring the server:
 *  - Absent optional fields (undefined/null at call time) are skipped entirely,
 *    contributing nothing to the body or the signature.
 *  - `signed: false` fields (payment_mode) are sent in the body but excluded
 *    from the signature.
 *  - `countryStateBlock` appends the per-country state fields after the listed
 *    fields: US -> us_state, postal_code; CA -> canada_state, postal_code.
 *
 * Each spec is parameterised by the SDK request type it belongs to, so `sdk`
 * keys are checked against that interface: renaming a field on the params type
 * without updating this registry is a compile error rather than a silently
 * broken signature.
 */

/**
 * One request field: `sdk` is the camelCase key on the SDK request object (and
 * must exist on `P`), `wire` is the snake_case key sent over the wire, and
 * `signed` (default true) marks whether it contributes to the signature —
 * `false` for fields such as `payment_mode` that are sent but excluded.
 */
export interface FieldSpec<P> {
  sdk: keyof P & string;
  wire: string;
  signed?: boolean;
}

/**
 * One endpoint's signing contract: the `path`, the ordered `fields`, and
 * `countryStateBlock`, which appends the per-country state fields
 * (us_state/canada_state + postal_code) after `fields`.
 */
export interface EndpointSpec<P> {
  method: 'POST';
  path: string;
  fields: FieldSpec<P>[];
  countryStateBlock?: boolean;
}

export const INVOICE_CREATE: EndpointSpec<CreateInvoiceParams> = {
  method: 'POST',
  path: '/api/v2/integration/init',
  fields: [
    { sdk: 'firstName', wire: 'first_name' },
    { sdk: 'lastName', wire: 'last_name' },
    { sdk: 'email', wire: 'email' },
    { sdk: 'orderTitle', wire: 'order_title' },
    { sdk: 'orderAmount', wire: 'order_amount' },
    { sdk: 'address', wire: 'address' },
    { sdk: 'city', wire: 'city' },
    { sdk: 'country', wire: 'country' },
    { sdk: 'state', wire: 'state' },
    { sdk: 'currency', wire: 'currency' },
    { sdk: 'redirectionUrl', wire: 'redirection_url' },
    { sdk: 'webhookUrl', wire: 'webhook_url' },
    { sdk: 'orderDetails', wire: 'order_details' },
    { sdk: 'paymentMode', wire: 'payment_mode', signed: false },
  ],
};

const INVOICE_ID_FIELD: FieldSpec<InvoiceRef> = { sdk: 'invoiceId', wire: 'invoice_id' };

export const PAYMENT_VOID: EndpointSpec<InvoiceRef> = {
  method: 'POST',
  path: '/api/integration/void',
  fields: [INVOICE_ID_FIELD],
};

export const PAYMENT_REFUND: EndpointSpec<AmountParams> = {
  method: 'POST',
  path: '/api/integration/refund',
  fields: [INVOICE_ID_FIELD, { sdk: 'amount', wire: 'amount' }],
};

export const PAYMENT_SETTLE: EndpointSpec<AmountParams> = {
  method: 'POST',
  path: '/api/integration/settle',
  fields: [INVOICE_ID_FIELD, { sdk: 'amount', wire: 'amount' }],
};

export const PAYMENT_REVERSE_AUTHORIZATION: EndpointSpec<InvoiceRef> = {
  method: 'POST',
  path: '/api/integration/reverse-authorization',
  fields: [INVOICE_ID_FIELD],
};

export const PAYMENT_CHECK_STATUS: EndpointSpec<InvoiceRef> = {
  method: 'POST',
  path: '/api/integration/check-status',
  fields: [INVOICE_ID_FIELD],
};

export const VCC_CHARGE: EndpointSpec<VccChargeParams> = {
  method: 'POST',
  path: '/api/v2/integration/vcc/charge',
  countryStateBlock: true,
  fields: [
    { sdk: 'firstName', wire: 'first_name' },
    { sdk: 'lastName', wire: 'last_name' },
    { sdk: 'email', wire: 'email' },
    { sdk: 'phone', wire: 'phone' },
    { sdk: 'currencyId', wire: 'currency_id' },
    { sdk: 'price', wire: 'price' },
    { sdk: 'product', wire: 'product' },
    { sdk: 'referenceNumber', wire: 'reference_number' },
    { sdk: 'cardNumber', wire: 'card_number' },
    { sdk: 'cardExpiryMonth', wire: 'card_expiry_month' },
    { sdk: 'cardExpiryYear', wire: 'card_expiry_year' },
    { sdk: 'cardCvv', wire: 'card_cvv' },
    { sdk: 'country', wire: 'country' },
    { sdk: 'address', wire: 'address' },
    { sdk: 'city', wire: 'city' },
  ],
};

export const CARD_TOKENIZE: EndpointSpec<TokenizeCardParams> = {
  method: 'POST',
  path: '/api/v2/integration/tokens/card',
  countryStateBlock: true,
  fields: [
    { sdk: 'firstName', wire: 'first_name' },
    { sdk: 'lastName', wire: 'last_name' },
    { sdk: 'email', wire: 'email' },
    { sdk: 'customerReference', wire: 'customer_reference' },
    { sdk: 'externalReference', wire: 'external_reference' },
    { sdk: 'cardNumber', wire: 'card_number' },
    { sdk: 'cardExpiryMonth', wire: 'card_expiry_month' },
    { sdk: 'cardExpiryYear', wire: 'card_expiry_year' },
    { sdk: 'cardCvv', wire: 'card_cvv' },
    { sdk: 'country', wire: 'country' },
    { sdk: 'address', wire: 'address' },
    { sdk: 'city', wire: 'city' },
  ],
};

export const CARD_CHARGE: EndpointSpec<ChargeTokenParams> = {
  method: 'POST',
  path: '/api/v2/integration/tokens/charge',
  countryStateBlock: true,
  fields: [
    { sdk: 'cardToken', wire: 'card_token' },
    { sdk: 'initiator', wire: 'initiator' },
    { sdk: 'firstName', wire: 'first_name' },
    { sdk: 'lastName', wire: 'last_name' },
    { sdk: 'email', wire: 'email' },
    { sdk: 'currency', wire: 'currency' },
    { sdk: 'price', wire: 'price' },
    { sdk: 'product', wire: 'product' },
    { sdk: 'referenceNumber', wire: 'reference_number' },
    { sdk: 'country', wire: 'country' },
    { sdk: 'address', wire: 'address' },
    { sdk: 'city', wire: 'city' },
  ],
};

export const CARD_REVOKE: EndpointSpec<RevokeTokenParams> = {
  method: 'POST',
  path: '/api/v2/integration/tokens/revoke',
  fields: [{ sdk: 'cardToken', wire: 'card_token' }],
};

export const RECURRING_CREATE: EndpointSpec<CreateRecurringParams> = {
  method: 'POST',
  path: '/api/v2/integration/recurring/init',
  fields: [
    { sdk: 'firstName', wire: 'first_name' },
    { sdk: 'lastName', wire: 'last_name' },
    { sdk: 'email', wire: 'email' },
    { sdk: 'orderTitle', wire: 'order_title' },
    { sdk: 'orderAmount', wire: 'order_amount' },
    { sdk: 'currency', wire: 'currency' },
    { sdk: 'cadenceInterval', wire: 'cadence_interval' },
    { sdk: 'cadenceCount', wire: 'cadence_count' },
    { sdk: 'totalCycles', wire: 'total_cycles' },
    { sdk: 'endDate', wire: 'end_date' },
    { sdk: 'consentText', wire: 'consent_text' },
    { sdk: 'externalReference', wire: 'external_reference' },
    { sdk: 'redirectionUrl', wire: 'redirection_url' },
    { sdk: 'webhookUrl', wire: 'webhook_url' },
  ],
};
