# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Optional `iframe` field on `invoices.create` (`iframe?: boolean | number`). Like `paymentMode`, it is an unsigned passthrough — sent in the request body but excluded from the HMAC signature. Set `iframe: true` to request a checkout suitable for embedding.
- Retry with exponential backoff and full jitter for transient failures (429, 5xx, network errors, timeouts), honoring `Retry-After`. Only replay-safe requests are retried — GETs, calls carrying an `Idempotency-Key`, and pure reads such as `payments.checkStatus`. Charges are never replayed.
- `maxRetries` client option (default `2`; `0` disables).
- `PaylinkApiError.retryAfterMs` and `PaylinkApiError.isRateLimited`.
- `User-Agent: paylink-js/<version> node/<version>` on every request.
- `RevokeTokenParams` type, exported.
- Tooling: ESLint, Prettier, coverage thresholds, `publint` + `attw` export validation, and a smoke test that loads the built `dist/` in both ESM and CJS.

### Fixed

- **Security:** `hashToken` was serialized in plaintext by `JSON.stringify(client)` and shown by `console.log(client)`, once per resource namespace. It is now a non-enumerable property.
- **Packaging:** CJS consumers resolved to ESM type declarations ("masquerading as ESM"). The `exports` map now declares `types` per format, pointing CJS at `index.d.cts`.
- An already-aborted `AbortSignal` was ignored and the request was sent anyway — meaning a charge could execute after the caller cancelled.

### Changed

- `timeoutMs` now applies per attempt rather than per call; with retries, total wall time can exceed it.
- `EndpointSpec` / `FieldSpec` are parameterised by the request type, so a field name that does not exist on the params interface is a compile error.

### Removed

- `refund_amount` / `refund_currency` from `WebhookPayload` and `WebhookEvent`. The server never sends them, so they were always `undefined`.

## [0.1.0]

### Added

- Initial release: checkouts, payment operations, VCC charges, card tokenization, recurring mandates, and webhook signature verification.
