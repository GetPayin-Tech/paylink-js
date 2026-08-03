# Security Policy

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report it privately via [GitHub's private vulnerability reporting](https://github.com/GetPayin-Tech/paylink-js/security/advisories/new), or email **tech@getpayin.com**.

Please include the SDK version, a description of the impact, and a reproduction if you have one. We aim to acknowledge within 3 business days.

## Supported versions

The latest minor release receives security fixes. Because the SDK is pre-1.0, patches are published against the newest version only.

## Handling credentials

This SDK is **server-side only**.

- `hashToken` is a signing secret. It must never reach a browser, a mobile app, or any client bundle. Anyone holding it can forge requests and webhooks for your integration.
- `publicToken` identifies the integration and is sent on every request. It is not secret, but it is not a substitute for the signing secret either.
- Load both from environment variables or a secret manager. Never commit them.

The client keeps `hashToken` as a non-enumerable property, so `JSON.stringify(client)` and `console.log(client)` do not expose it. That is a safety net, not a licence to log the config — nothing prevents reading `config.hashToken` directly.

## Things this SDK does not do for you

- **Webhook replay protection.** PayLink webhook signatures carry no timestamp or nonce, so a valid payload stays valid forever. Signature verification proves authenticity, not freshness. Pair `webhooks.verify()` with your own idempotency keyed on `invoice_id`.
- **PCI scope reduction.** `vcc.charge` and `cards.tokenize` accept raw PAN and CVV. Sending real card data through your server puts that server in PCI scope. Prefer the hosted checkout (`invoices.create`) or card tokens where possible.
- **Error redaction.** `PaylinkApiError.raw` holds the API's response body verbatim so failures stay debuggable. If you forward errors to a third-party log or APM, review what that body can contain for your integration.
