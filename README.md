# @getpayin-tech/paylink-js

[![CI](https://github.com/GetPayin-Tech/paylink-js/actions/workflows/ci.yml/badge.svg)](https://github.com/GetPayin-Tech/paylink-js/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@getpayin-tech/paylink-js.svg)](https://www.npmjs.com/package/@getpayin-tech/paylink-js)
[![install size](https://packagephobia.com/badge?p=@getpayin-tech/paylink-js)](https://packagephobia.com/result?p=@getpayin-tech/paylink-js)

Official **server-side** Node.js/TypeScript SDK for the PayLink payment
integration API. It wraps every integration endpoint with an idiomatic, typed
API and computes the order-sensitive HMAC-SHA256 signatures for you, so you
never have to build them by hand.

- Checkouts (`invoices.create`)
- Payment operations (`payments.void` / `refund` / `settle` / `reverseAuthorization` / `checkStatus`)
- Server-to-server card charges (`vcc.charge`)
- Card tokenization (`cards.tokenize` / `charge` / `revoke`)
- Recurring mandates (`recurring.create` / `status` / `cancel` / `pause` / `resume`)
- Webhook signature verification (`webhooks.verify`)

> **Server-side only.** Signing uses your secret `hashToken`. Never ship it to a
> browser or mobile client.

## Requirements

- Node.js **18+** (uses the built-in global `fetch` and `node:crypto`).
  Node 18 reached end-of-life in April 2025 — it is still supported and tested
  here, but new projects should be on 20 or 22.
- Zero runtime dependencies
- Ships ESM and CommonJS builds with per-format type declarations

## Install

```bash
npm install @getpayin-tech/paylink-js
```

## Quick start

```ts
import { PaylinkClient } from '@getpayin-tech/paylink-js';

const paylink = new PaylinkClient({
  publicToken: process.env.PAYLINK_PUBLIC_TOKEN!,
  hashToken: process.env.PAYLINK_HASH_TOKEN!, // secret — server-side only
  // baseUrl defaults to https://pay.getpayin.com
  // timeoutMs defaults to 30000 (per attempt)
  // maxRetries defaults to 2 (set 0 to disable retries)
});

const checkout = await paylink.invoices.create({
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  orderTitle: 'Gold Plan',
  orderAmount: '250.00', // pass amounts as strings to control the exact wire form
  currency: 'USD',
  redirectionUrl: 'https://shop.example.com/return',
  webhookUrl: 'https://shop.example.com/webhooks/paylink',
});

// Redirect the payer to the hosted checkout:
console.log(checkout.checkoutUrl, checkout.invoiceId, checkout.expiresAt);
```

Both credentials are issued in the PayLink dashboard under
**Settings → Payment Integrations**. `publicToken` is sent on every request;
`hashToken` is the secret used only to sign — it never leaves your server.

## Payment operations

```ts
await paylink.payments.void({ invoiceId });
await paylink.payments.settle({ invoiceId, amount: '50.00' });
await paylink.payments.reverseAuthorization({ invoiceId });

const status = await paylink.payments.checkStatus({ invoiceId });
// { invoiceId, paidStatus, authCode }

// Refunds are idempotent when you pass an idempotency key — safe to retry:
const refund = await paylink.payments.refund(
  { invoiceId, amount: '10.50' },
  { idempotencyKey: 'refund-order-1234' },
);
// { invoiceId, paidStatus, authCode, refundAmount }
```

## Card tokenization

```ts
const { token } = await paylink.cards.tokenize({
  firstName: 'Jane',
  lastName: 'Doe',
  cardNumber: '4111111111111111',
  cardExpiryMonth: '12',
  cardExpiryYear: '2030',
  cardCvv: '123',
  country: 'EG',
  address: '1 Main St',
  city: 'Cairo',
});

await paylink.cards.charge({
  cardToken: token,
  initiator: 'merchant',
  firstName: 'Jane',
  lastName: 'Doe',
  currency: 'USD',
  price: '100.00',
  product: 'Monthly rebill',
  country: 'EG',
  address: '1 Main St',
  city: 'Cairo',
});

await paylink.cards.revoke({ cardToken: token });
```

For `US` and `CA` billing addresses, also pass the state fields the API
requires: `usState` + `postalCode` (US) or `canadaState` + `postalCode` (CA).

## Recurring mandates

```ts
const mandate = await paylink.recurring.create(
  {
    firstName: 'Sam',
    lastName: 'Doe',
    email: 'sam@example.com',
    orderTitle: 'Gold subscription',
    orderAmount: '250.00',
    currency: 'USD',
    cadenceInterval: 'month',
    cadenceCount: 1,
    totalCycles: 12,
    consentText: 'I authorise recurring monthly charges.',
  },
  { idempotencyKey: 'sub-signup-42' },
);

await paylink.recurring.status(mandate.mandateId);
await paylink.recurring.pause(mandate.mandateId);
await paylink.recurring.resume(mandate.mandateId);
await paylink.recurring.cancel(mandate.mandateId);
```

## Idempotency

Retrying a write after a network error or timeout risks performing it twice. To
make that safe, pass an `idempotencyKey` in the per-call overrides — the SDK
sends it as the `Idempotency-Key` header and the server returns the original
result instead of charging, refunding, or creating a second time. Keys are
scoped per integration and capped at 64 characters.

| Endpoint           | A replay with the same key returns     |
| ------------------ | -------------------------------------- |
| `invoices.create`  | the original invoice and `checkoutUrl` |
| `vcc.charge`       | the original charge                    |
| `cards.charge`     | the original charge                    |
| `payments.refund`  | the original refund                    |
| `recurring.create` | the original mandate                   |

```ts
await paylink.vcc.charge({/* card + order fields */}, { idempotencyKey: 'vcc-order-1234' });
await paylink.cards.charge({/* token + order fields */}, { idempotencyKey: 'tok-order-1234' });
await paylink.invoices.create({/* customer + order fields */}, { idempotencyKey: 'order-1234' });
```

Reusing a key with a _different_ request — for example `recurring.create` with
changed terms, or `payments.refund` for a different amount — is rejected as a
conflict: a `PaylinkApiError` with `isIdempotencyConflict` set (HTTP 409). Only
the endpoints above honor the header.

## Verifying webhooks

Pass the **parsed JSON body** (or the raw string) to `verify`. It recomputes the
signature with your `hashToken` and compares in constant time.

```ts
import express from 'express';
import { PaylinkClient, PaylinkSignatureError } from '@getpayin-tech/paylink-js';

const paylink = new PaylinkClient({ publicToken, hashToken });
const app = express();

app.post('/webhooks/paylink', express.json(), (req, res) => {
  try {
    const event = paylink.webhooks.verify(req.body);
    // event.event, event.invoiceId, event.success, event.raw, ...
    res.sendStatus(200);
  } catch (error) {
    if (error instanceof PaylinkSignatureError) {
      return res.sendStatus(400);
    }
    throw error;
  }
});
```

> PayLink webhook signatures carry no timestamp, so verification does not protect
> against replay. Pair it with your own idempotency keyed on `invoice_id`.

## Error handling

Every failure is a subclass of `PaylinkError`:

| Error                    | When                                                                                                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PaylinkConfigError`     | Invalid client configuration (missing tokens, no `fetch`).                                                                                                                                                                              |
| `PaylinkApiError`        | The API returned an error. Carries `status`, `errors`, `raw`, `retryAfterMs`, `isIdempotencyConflict` (409), `isRateLimited` (429), and `isForbidden` (403 — e.g. card tokenization or recurring payments not enabled for the account). |
| `PaylinkSignatureError`  | A webhook signature did not verify.                                                                                                                                                                                                     |
| `PaylinkConnectionError` | Network failure or timeout (no HTTP response).                                                                                                                                                                                          |

```ts
import { PaylinkApiError } from '@getpayin-tech/paylink-js';

try {
  await paylink.payments.refund({ invoiceId, amount: '10.00' });
} catch (error) {
  if (error instanceof PaylinkApiError && error.isIdempotencyConflict) {
    // a refund with this idempotency key already exists
  }
}
```

## Retries and rate limiting

Every integration endpoint is rate limited server-side, so 429s are an expected
condition under burst traffic rather than an edge case. The SDK retries
transient failures — **429, 5xx, network errors, and timeouts** — with
exponential backoff and full jitter, honoring the server's `Retry-After` header
when present.

**A request is only ever replayed when replaying it cannot double-charge:**

| Replayed                                 | Not replayed                                        |
| ---------------------------------------- | --------------------------------------------------- |
| All `GET`s (`recurring.status`)          | `vcc.charge`, `cards.charge`, `cards.tokenize`      |
| Any call you pass an `idempotencyKey` to | `invoices.create`, `recurring.create` without a key |
| `payments.checkStatus` (a pure read)     | `recurring.cancel` / `pause` / `resume`             |

So to make a refund safely retryable, pass an idempotency key — otherwise a
failed refund surfaces immediately and is yours to handle:

```ts
await paylink.payments.refund(
  { invoiceId, amount: '10.50' },
  { idempotencyKey: 'refund-order-1234' }, // now retried on 429/5xx
);
```

Tune or disable retries per client:

```ts
new PaylinkClient({ publicToken, hashToken, maxRetries: 0 }); // off
```

`timeoutMs` applies to **each attempt**, so worst-case wall time is roughly
`(maxRetries + 1) × timeoutMs` plus backoff. For requests the SDK will not
replay, `PaylinkApiError.retryAfterMs` exposes the server's backoff hint so you
can schedule your own retry:

```ts
catch (error) {
  if (error instanceof PaylinkApiError && error.isRateLimited) {
    await enqueueAfter(error.retryAfterMs ?? 1000);
  }
}
```

## Amounts and precision

Signatures are computed over the exact bytes sent on the wire. To avoid any
floating-point ambiguity, **pass monetary amounts as strings** (e.g. `'10.50'`).
Numbers are accepted and stringified, but strings give you full control.

## API reference

The full HTTP API — endpoints, fields, error codes, and test cards — is
documented in the PayLink API reference:
<https://pay.getpayin.com/docs/payment_integration/index.html>

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — in particular the note on signed-field
ordering, which is the one thing that must stay in lockstep with the server.

Security issues: see [SECURITY.md](SECURITY.md). Please do not open a public
issue for a vulnerability.

## License

MIT
