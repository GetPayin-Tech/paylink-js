import type { FetchLike, FetchResponse, ResolvedConfig } from '../src/config';

export interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface FakeResponse {
  status?: number;
  ok?: boolean;
  json?: unknown;
  text?: string;
}

export function fakeFetch(handler: (req: CapturedRequest) => FakeResponse): {
  fetch: FetchLike;
  calls: CapturedRequest[];
} {
  const calls: CapturedRequest[] = [];

  const fetch: FetchLike = async (url, init) => {
    const captured: CapturedRequest = {
      url,
      method: init.method,
      headers: init.headers,
      body: init.body,
    };
    calls.push(captured);

    const res = handler(captured);
    const status = res.status ?? 200;
    const bodyText = res.text ?? JSON.stringify(res.json ?? null);

    const response: FetchResponse = {
      status,
      ok: res.ok ?? (status >= 200 && status < 300),
      headers: { get: () => null },
      text: async () => bodyText,
    };

    return response;
  };

  return { fetch, calls };
}

export function fakeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    publicToken: 'pub_token',
    hashToken: 'test_hash_token_abc123',
    baseUrl: 'https://pay.getpayin.com',
    timeoutMs: 30_000,
    fetch: fakeFetch(() => ({ json: { success: true, data: {} } })).fetch,
    ...overrides,
  };
}

export function bodyOf(call: CapturedRequest): Record<string, unknown> {
  return call.body ? (JSON.parse(call.body) as Record<string, unknown>) : {};
}
