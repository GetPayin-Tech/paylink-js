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
 */

/**
 * One request field: `sdk` is the camelCase key on the SDK request object,
 * `wire` is the snake_case key sent over the wire, and `signed` (default true)
 * marks whether it contributes to the signature — `false` for fields such as
 * `payment_mode` that are sent but excluded from signing.
 */
export interface FieldSpec {
  sdk: string;
  wire: string;
  signed?: boolean;
}

/**
 * One endpoint's signing contract: the `path`, the ordered `fields`, and
 * `countryStateBlock`, which appends the per-country state fields
 * (us_state/canada_state + postal_code) after `fields`.
 */
export interface EndpointSpec {
  method: 'POST';
  path: string;
  fields: FieldSpec[];
  countryStateBlock?: boolean;
}

const f = (sdk: string, wire: string): FieldSpec => ({ sdk, wire });
const unsigned = (sdk: string, wire: string): FieldSpec => ({ sdk, wire, signed: false });

export const INVOICE_CREATE: EndpointSpec = {
  method: 'POST',
  path: '/api/v2/integration/init',
  fields: [
    f('firstName', 'first_name'),
    f('lastName', 'last_name'),
    f('email', 'email'),
    f('orderTitle', 'order_title'),
    f('orderAmount', 'order_amount'),
    f('address', 'address'),
    f('city', 'city'),
    f('country', 'country'),
    f('state', 'state'),
    f('currency', 'currency'),
    f('redirectionUrl', 'redirection_url'),
    f('webhookUrl', 'webhook_url'),
    f('orderDetails', 'order_details'),
    unsigned('paymentMode', 'payment_mode'),
  ],
};

const PAYMENT_INVOICE_ONLY: FieldSpec[] = [f('invoiceId', 'invoice_id')];
const PAYMENT_INVOICE_AMOUNT: FieldSpec[] = [f('invoiceId', 'invoice_id'), f('amount', 'amount')];

export const PAYMENT_VOID: EndpointSpec = {
  method: 'POST',
  path: '/api/integration/void',
  fields: PAYMENT_INVOICE_ONLY,
};

export const PAYMENT_REFUND: EndpointSpec = {
  method: 'POST',
  path: '/api/integration/refund',
  fields: PAYMENT_INVOICE_AMOUNT,
};

export const PAYMENT_SETTLE: EndpointSpec = {
  method: 'POST',
  path: '/api/integration/settle',
  fields: PAYMENT_INVOICE_AMOUNT,
};

export const PAYMENT_REVERSE_AUTHORIZATION: EndpointSpec = {
  method: 'POST',
  path: '/api/integration/reverse-authorization',
  fields: PAYMENT_INVOICE_ONLY,
};

export const PAYMENT_CHECK_STATUS: EndpointSpec = {
  method: 'POST',
  path: '/api/integration/check-status',
  fields: PAYMENT_INVOICE_ONLY,
};

export const VCC_CHARGE: EndpointSpec = {
  method: 'POST',
  path: '/api/v2/integration/vcc/charge',
  countryStateBlock: true,
  fields: [
    f('firstName', 'first_name'),
    f('lastName', 'last_name'),
    f('email', 'email'),
    f('phone', 'phone'),
    f('currencyId', 'currency_id'),
    f('price', 'price'),
    f('product', 'product'),
    f('referenceNumber', 'reference_number'),
    f('cardNumber', 'card_number'),
    f('cardExpiryMonth', 'card_expiry_month'),
    f('cardExpiryYear', 'card_expiry_year'),
    f('cardCvv', 'card_cvv'),
    f('country', 'country'),
    f('address', 'address'),
    f('city', 'city'),
  ],
};

export const CARD_TOKENIZE: EndpointSpec = {
  method: 'POST',
  path: '/api/v2/integration/tokens/card',
  countryStateBlock: true,
  fields: [
    f('firstName', 'first_name'),
    f('lastName', 'last_name'),
    f('email', 'email'),
    f('customerReference', 'customer_reference'),
    f('externalReference', 'external_reference'),
    f('cardNumber', 'card_number'),
    f('cardExpiryMonth', 'card_expiry_month'),
    f('cardExpiryYear', 'card_expiry_year'),
    f('cardCvv', 'card_cvv'),
    f('country', 'country'),
    f('address', 'address'),
    f('city', 'city'),
  ],
};

export const CARD_CHARGE: EndpointSpec = {
  method: 'POST',
  path: '/api/v2/integration/tokens/charge',
  countryStateBlock: true,
  fields: [
    f('cardToken', 'card_token'),
    f('initiator', 'initiator'),
    f('firstName', 'first_name'),
    f('lastName', 'last_name'),
    f('email', 'email'),
    f('currency', 'currency'),
    f('price', 'price'),
    f('product', 'product'),
    f('referenceNumber', 'reference_number'),
    f('country', 'country'),
    f('address', 'address'),
    f('city', 'city'),
  ],
};

export const CARD_REVOKE: EndpointSpec = {
  method: 'POST',
  path: '/api/v2/integration/tokens/revoke',
  fields: [f('cardToken', 'card_token')],
};

export const RECURRING_CREATE: EndpointSpec = {
  method: 'POST',
  path: '/api/v2/integration/recurring/init',
  fields: [
    f('firstName', 'first_name'),
    f('lastName', 'last_name'),
    f('email', 'email'),
    f('orderTitle', 'order_title'),
    f('orderAmount', 'order_amount'),
    f('currency', 'currency'),
    f('cadenceInterval', 'cadence_interval'),
    f('cadenceCount', 'cadence_count'),
    f('totalCycles', 'total_cycles'),
    f('endDate', 'end_date'),
    f('consentText', 'consent_text'),
    f('externalReference', 'external_reference'),
    f('redirectionUrl', 'redirection_url'),
    f('webhookUrl', 'webhook_url'),
  ],
};
