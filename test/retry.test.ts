import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FetchLike } from '../src/config';
import { PaylinkApiError, PaylinkConnectionError } from '../src/errors';
import { execute, USER_AGENT } from '../src/http';
import { VERSION } from '../src/version';
import { fakeConfig, fakeFetch } from './helpers';

/** No real sleeping: backoff resolves immediately in tests. */
const noDelay = { retryBaseDelayMs: 0 };

/** A fetch that fails with `status` for the first `failures` calls, then succeeds. */
function flaky(failures: number, status: number, headers: Record<string, string> = {}) {
  let calls = 0;

  const fetch: FetchLike = async () => {
    calls += 1;

    if (calls <= failures) {
      return {
        status,
        ok: false,
        headers: { get: (name: string): string | null => headers[name] ?? null },
        text: async () => JSON.stringify({ success: false, message: 'transient' }),
      };
    }

    return {
      status: 200,
      ok: true,
      headers: { get: (): string | null => null },
      text: async () => JSON.stringify({ success: true, data: { ok: true } }),
    };
  };

  return { fetch, calls: () => calls };
}

describe('retry', () => {
  it('retries a 429 on a GET and eventually succeeds', async () => {
    const { fetch, calls } = flaky(2, 429);

    const result = await execute(fakeConfig({ fetch, ...noDelay }), {
      method: 'GET',
      path: '/api/v2/integration/recurring/M1',
    });

    expect(result).toEqual({ ok: true });
    expect(calls()).toBe(3);
  });

  it('retries a 503 on a POST that carries an Idempotency-Key', async () => {
    const { fetch, calls } = flaky(1, 503);

    await execute(fakeConfig({ fetch, ...noDelay }), {
      method: 'POST',
      path: '/api/integration/refund',
      body: {},
      idempotencyKey: 'refund-1',
    });

    expect(calls()).toBe(2);
  });

  it('NEVER retries a bare POST — a charge must not be replayed', async () => {
    const { fetch, calls } = flaky(1, 503);

    await expect(
      execute(fakeConfig({ fetch, ...noDelay }), {
        method: 'POST',
        path: '/api/v2/integration/vcc/charge',
        body: {},
      }),
    ).rejects.toBeInstanceOf(PaylinkApiError);

    expect(calls()).toBe(1);
  });

  it('retries a POST explicitly flagged replaySafe (check-status)', async () => {
    const { fetch, calls } = flaky(1, 500);

    await execute(fakeConfig({ fetch, ...noDelay }), {
      method: 'POST',
      path: '/api/integration/check-status',
      body: {},
      replaySafe: true,
    });

    expect(calls()).toBe(2);
  });

  it('does not retry a 4xx that is not 429', async () => {
    const { fetch, calls } = flaky(1, 422);

    await expect(
      execute(fakeConfig({ fetch, ...noDelay }), { method: 'GET', path: '/x' }),
    ).rejects.toBeInstanceOf(PaylinkApiError);

    expect(calls()).toBe(1);
  });

  it('gives up after maxRetries and throws the last error', async () => {
    const { fetch, calls } = flaky(99, 429);

    const error = (await execute(fakeConfig({ fetch, maxRetries: 2, ...noDelay }), {
      method: 'GET',
      path: '/x',
    }).catch((e) => e)) as PaylinkApiError;

    expect(error).toBeInstanceOf(PaylinkApiError);
    expect(error.isRateLimited).toBe(true);
    expect(calls()).toBe(3);
  });

  it('honors maxRetries: 0 as "no retries"', async () => {
    const { fetch, calls } = flaky(99, 503);

    await expect(
      execute(fakeConfig({ fetch, maxRetries: 0, ...noDelay }), { method: 'GET', path: '/x' }),
    ).rejects.toBeInstanceOf(PaylinkApiError);

    expect(calls()).toBe(1);
  });

  it('retries network failures on replay-safe requests', async () => {
    let calls = 0;
    const fetch: FetchLike = async () => {
      calls += 1;

      if (calls === 1) {
        throw new Error('ECONNRESET');
      }

      return {
        status: 200,
        ok: true,
        headers: { get: (): string | null => null },
        text: async () => JSON.stringify({ success: true, data: { ok: true } }),
      };
    };

    await execute(fakeConfig({ fetch, ...noDelay }), { method: 'GET', path: '/x' });

    expect(calls).toBe(2);
  });

  it('stops retrying once the caller aborts', async () => {
    const controller = new AbortController();
    let calls = 0;
    const fetch: FetchLike = async () => {
      calls += 1;
      controller.abort();

      throw new Error('ECONNRESET');
    };

    await expect(
      execute(fakeConfig({ fetch, ...noDelay }), {
        method: 'GET',
        path: '/x',
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(PaylinkConnectionError);

    expect(calls).toBe(1);
  });
});

describe('Retry-After', () => {
  it('parses delta-seconds onto the error as retryAfterMs', async () => {
    const { fetch } = flaky(99, 429, { 'Retry-After': '2' });

    const error = (await execute(fakeConfig({ fetch, maxRetries: 0 }), {
      method: 'GET',
      path: '/x',
    }).catch((e) => e)) as PaylinkApiError;

    expect(error.retryAfterMs).toBe(2000);
  });

  it('parses an HTTP-date Retry-After', async () => {
    const future = new Date(Date.now() + 5000).toUTCString();
    const { fetch } = flaky(99, 429, { 'Retry-After': future });

    const error = (await execute(fakeConfig({ fetch, maxRetries: 0 }), {
      method: 'GET',
      path: '/x',
    }).catch((e) => e)) as PaylinkApiError;

    expect(error.retryAfterMs).toBeGreaterThan(3000);
    expect(error.retryAfterMs).toBeLessThanOrEqual(5000);
  });

  it('leaves retryAfterMs undefined when the header is absent', async () => {
    const { fetch } = flaky(99, 500);

    const error = (await execute(fakeConfig({ fetch, maxRetries: 0 }), {
      method: 'GET',
      path: '/x',
    }).catch((e) => e)) as PaylinkApiError;

    expect(error.retryAfterMs).toBeUndefined();
  });
});

describe('User-Agent', () => {
  it('is sent on every request', async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: { success: true, data: {} } }));
    await execute(fakeConfig({ fetch }), { method: 'POST', path: '/x', body: {} });

    expect(calls[0]?.headers['User-Agent']).toBe(USER_AGENT);
    expect(calls[0]?.headers['User-Agent']).toContain(`paylink-js/${VERSION}`);
  });
});

describe('VERSION', () => {
  it('stays in sync with package.json', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string };

    expect(VERSION).toBe(pkg.version);
  });
});
