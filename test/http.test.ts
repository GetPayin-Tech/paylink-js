import { describe, expect, it } from 'vitest';
import type { FetchLike } from '../src/config';
import { PaylinkApiError, PaylinkConnectionError } from '../src/errors';
import { execute } from '../src/http';
import { fakeConfig, fakeFetch } from './helpers';

describe('execute', () => {
  it('returns the data payload of a success envelope', async () => {
    const { fetch } = fakeFetch(() => ({ json: { success: true, data: { foo: 'bar' } } }));
    const result = await execute<{ foo: string }>(fakeConfig({ fetch }), {
      method: 'POST',
      path: '/x',
      body: {},
    });

    expect(result).toEqual({ foo: 'bar' });
  });

  it('sends JSON body and Content-Type for POST', async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: { success: true, data: {} } }));
    await execute(fakeConfig({ fetch }), { method: 'POST', path: '/x', body: { a: '1' } });

    expect(calls[0]?.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({ a: '1' });
  });

  it('appends query params and omits a body for GET', async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: { success: true, data: {} } }));
    await execute(fakeConfig({ fetch }), {
      method: 'GET',
      path: '/api/v2/integration/recurring/M1',
      query: { token: 'pub', signature: 'sig+/=' },
    });

    expect(calls[0]?.url).toContain('/recurring/M1?');
    expect(calls[0]?.url).toContain('token=pub');
    expect(calls[0]?.url).toContain('signature=sig%2B%2F%3D');
    expect(calls[0]?.body).toBeUndefined();
  });

  it('forwards the Idempotency-Key header when provided', async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: { success: true, data: {} } }));
    await execute(fakeConfig({ fetch }), {
      method: 'POST',
      path: '/x',
      body: {},
      idempotencyKey: 'key-123',
    });

    expect(calls[0]?.headers['Idempotency-Key']).toBe('key-123');
  });

  it('throws PaylinkApiError with message and status on a non-2xx response', async () => {
    const { fetch } = fakeFetch(() => ({ status: 422, json: { success: false, message: 'Invalid signature.' } }));

    const error = (await execute(fakeConfig({ fetch }), { method: 'POST', path: '/x', body: {} }).catch(
      (e) => e,
    )) as PaylinkApiError;

    expect(error).toBeInstanceOf(PaylinkApiError);
    expect(error.status).toBe(422);
    expect(error.message).toBe('Invalid signature.');
  });

  it('throws PaylinkApiError on a 200 body with success:false', async () => {
    const { fetch } = fakeFetch(() => ({ status: 200, json: { success: false, message: 'nope', errors: { x: ['y'] } } }));

    const error = (await execute(fakeConfig({ fetch }), { method: 'POST', path: '/x', body: {} }).catch(
      (e) => e,
    )) as PaylinkApiError;

    expect(error).toBeInstanceOf(PaylinkApiError);
    expect(error.errors).toEqual({ x: ['y'] });
  });

  it('surfaces a feature-disabled 403 as PaylinkApiError with status, message, and isForbidden', async () => {
    const { fetch } = fakeFetch(() => ({
      status: 403,
      json: { success: false, message: 'Card tokenization is not enabled for your account. Please contact the business team.' },
    }));

    const error = (await execute(fakeConfig({ fetch }), { method: 'POST', path: '/x', body: {} }).catch(
      (e) => e,
    )) as PaylinkApiError;

    expect(error).toBeInstanceOf(PaylinkApiError);
    expect(error.status).toBe(403);
    expect(error.isForbidden).toBe(true);
    expect(error.message).toContain('not enabled');
  });

  it('maps a recurring resume 403 whose message is nested under data', async () => {
    const { fetch } = fakeFetch(() => ({
      status: 403,
      json: { data: { message: 'Recurring payments is disabled for this company.' }, success: false },
    }));

    const error = (await execute(fakeConfig({ fetch }), { method: 'POST', path: '/x', body: {} }).catch(
      (e) => e,
    )) as PaylinkApiError;

    expect(error.isForbidden).toBe(true);
    expect(error.message).toBe('Recurring payments is disabled for this company.');
  });

  it('flags idempotency conflicts (409)', async () => {
    const { fetch } = fakeFetch(() => ({ status: 409, json: { data: null, success: false, message: 'dup' } }));
    const error = (await execute(fakeConfig({ fetch }), { method: 'POST', path: '/x', body: {} }).catch(
      (e) => e,
    )) as PaylinkApiError;

    expect(error.isIdempotencyConflict).toBe(true);
    expect(error.message).toBe('dup');
  });

  it('falls back to data.message when the top-level message is absent', async () => {
    const { fetch } = fakeFetch(() => ({ status: 409, json: { data: { message: 'nested dup' }, success: false } }));
    const error = (await execute(fakeConfig({ fetch }), { method: 'POST', path: '/x', body: {} }).catch(
      (e) => e,
    )) as PaylinkApiError;

    expect(error.message).toBe('nested dup');
  });

  it('wraps network failures in PaylinkConnectionError', async () => {
    const fetch: FetchLike = async () => {
      throw new Error('ECONNREFUSED');
    };

    await expect(
      execute(fakeConfig({ fetch }), { method: 'POST', path: '/x', body: {} }),
    ).rejects.toBeInstanceOf(PaylinkConnectionError);
  });

  it('does not send the request when the caller signal is already aborted', async () => {
    let sent = false;
    const fetch: FetchLike = async () => {
      sent = true;

      throw new Error('should never be reached');
    };

    const error = (await execute(fakeConfig({ fetch }), {
      method: 'POST',
      path: '/api/integration/refund',
      body: {},
      signal: AbortSignal.abort(),
    }).catch((e) => e)) as PaylinkConnectionError;

    expect(sent).toBe(false);
    expect(error).toBeInstanceOf(PaylinkConnectionError);
    expect(error.message).toContain('aborted before it was sent');
  });

  it('aborts an in-flight request when the caller signal fires', async () => {
    const controller = new AbortController();
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        setTimeout(() => controller.abort(), 5);
      });

    const error = (await execute(fakeConfig({ fetch }), {
      method: 'POST',
      path: '/x',
      body: {},
      signal: controller.signal,
    }).catch((e) => e)) as PaylinkConnectionError;

    expect(error).toBeInstanceOf(PaylinkConnectionError);
    expect(error.message).toContain('failed');
  });

  it('times out and throws PaylinkConnectionError', async () => {
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });

    const error = (await execute(fakeConfig({ fetch, timeoutMs: 10 }), {
      method: 'POST',
      path: '/slow',
      body: {},
    }).catch((e) => e)) as PaylinkConnectionError;

    expect(error).toBeInstanceOf(PaylinkConnectionError);
    expect(error.message).toContain('timed out');
  });
});
