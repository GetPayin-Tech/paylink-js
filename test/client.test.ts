import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { PaylinkClient } from '../src/client';
import { resolveConfig } from '../src/config';

const SECRET = 'SUPER_SECRET_HASH_TOKEN';

function newClient(): PaylinkClient {
  return new PaylinkClient({ publicToken: 'pub_abc', hashToken: SECRET });
}

describe('hashToken exposure', () => {
  it('is not serialized by JSON.stringify on the client', () => {
    expect(JSON.stringify(newClient())).not.toContain(SECRET);
  });

  it('is not serialized by JSON.stringify on a resolved config', () => {
    const config = resolveConfig({ publicToken: 'pub_abc', hashToken: SECRET });

    expect(JSON.stringify(config)).not.toContain(SECRET);
  });

  it('is not shown by util.inspect (console.log) on the client', () => {
    expect(inspect(newClient(), { depth: 10 })).not.toContain(SECRET);
  });

  it('is not copied by object spread', () => {
    const config = resolveConfig({ publicToken: 'pub_abc', hashToken: SECRET });

    expect(JSON.stringify({ ...config })).not.toContain(SECRET);
  });

  it('is not exposed via Object.keys or Object.entries', () => {
    const config = resolveConfig({ publicToken: 'pub_abc', hashToken: SECRET });

    expect(Object.keys(config)).not.toContain('hashToken');
    expect(JSON.stringify(Object.entries(config))).not.toContain(SECRET);
  });

  it('is still readable for signing, and is not silently writable', () => {
    const config = resolveConfig({ publicToken: 'pub_abc', hashToken: SECRET });

    expect(config.hashToken).toBe(SECRET);
    expect(() => {
      (config as { hashToken: string }).hashToken = 'overwritten';
    }).toThrow(TypeError);
  });

  it('still signs correctly with the hidden secret', async () => {
    const calls: string[] = [];
    const client = new PaylinkClient({
      publicToken: 'pub_abc',
      hashToken: SECRET,
      fetch: async (_url, init) => {
        calls.push(init.body ?? '');

        return {
          status: 200,
          ok: true,
          headers: { get: (): string | null => null },
          text: async () =>
            JSON.stringify({
              success: true,
              data: { checkout_url: 'https://x/y', invoice_id: 1, expires_at: 'now' },
            }),
        };
      },
    });

    await client.invoices.create({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      orderTitle: 'Gold Plan',
      orderAmount: '250.00',
      currency: 'USD',
    });

    const body = JSON.parse(calls[0] ?? '{}') as Record<string, string>;

    expect(body.signature).toBeTruthy();
    expect(body.token).toBe('pub_abc');
  });
});
