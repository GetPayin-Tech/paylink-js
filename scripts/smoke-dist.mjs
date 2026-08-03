/**
 * Smoke-test the BUILT artifact, not the source.
 *
 * CI previously built `dist/` and threw it away without ever loading it, so a
 * broken `exports` map, a bad interop shape, or a missing runtime export would
 * only have surfaced after publishing. This loads both the ESM and the CJS
 * build the way a consumer would and asserts the public surface works.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const SECRET = 'smoke_secret_hash_token';

const builds = [
  ['esm', await import('../dist/index.js')],
  ['cjs', require('../dist/index.cjs')],
];

for (const [label, mod] of builds) {
  assert.equal(typeof mod.PaylinkClient, 'function', `${label}: PaylinkClient is not exported`);

  for (const name of [
    'PaylinkError',
    'PaylinkConfigError',
    'PaylinkApiError',
    'PaylinkSignatureError',
    'PaylinkConnectionError',
  ]) {
    assert.equal(typeof mod[name], 'function', `${label}: ${name} is not exported`);
  }

  assert.equal(
    mod.WebhookEventType.InvoicePaid,
    'invoice.paid',
    `${label}: WebhookEventType is not exported as a runtime value`,
  );

  const client = new mod.PaylinkClient({ publicToken: 'pub_smoke', hashToken: SECRET });

  for (const namespace of ['invoices', 'payments', 'vcc', 'cards', 'recurring', 'webhooks']) {
    assert.ok(client[namespace], `${label}: client.${namespace} is missing`);
  }

  // The secret must stay non-enumerable through the build pipeline too —
  // tsup could otherwise transform the property definition.
  assert.ok(
    !JSON.stringify(client).includes(SECRET),
    `${label}: hashToken leaked into JSON.stringify(client)`,
  );

  // Error subclasses must survive bundling for `instanceof` narrowing to work.
  const apiError = new mod.PaylinkApiError('boom', { status: 429 });
  assert.ok(apiError instanceof mod.PaylinkError, `${label}: error prototype chain is broken`);
  assert.equal(apiError.isRateLimited, true, `${label}: isRateLimited getter is missing`);
}

console.log(`dist smoke: ok (${builds.map(([label]) => label).join(', ')})`);
