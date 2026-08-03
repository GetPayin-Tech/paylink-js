import { PaylinkConfigError } from './errors';

/** Minimal subset of the response object the SDK relies on. */
export interface FetchResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}

/** Minimal `fetch` signature — the global `fetch` satisfies this structurally. */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<FetchResponse>;

/**
 * Configuration for {@link PaylinkClient}.
 *
 * - `publicToken` — identifies the integration; sent as `token` on every request.
 * - `hashToken` — secret signing key; server-side only, never expose to a browser.
 * - `baseUrl` — API base URL; defaults to `https://pay.getpayin.com`.
 * - `timeoutMs` — per-request timeout in milliseconds; defaults to 30000.
 * - `fetch` — custom `fetch` implementation; defaults to the global `fetch`
 *   (Node 18+). Useful for injecting a mock in tests or a proxy-aware client.
 */
export interface PaylinkClientConfig {
  publicToken: string;
  hashToken: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: FetchLike;
}

export interface ResolvedConfig {
  publicToken: string;
  hashToken: string;
  baseUrl: string;
  timeoutMs: number;
  fetch: FetchLike;
}

const DEFAULT_BASE_URL = 'https://pay.getpayin.com';
const DEFAULT_TIMEOUT_MS = 30_000;

export function resolveConfig(config: PaylinkClientConfig): ResolvedConfig {
  const publicToken = requireNonEmpty(config.publicToken, 'publicToken');
  const hashToken = requireNonEmpty(config.hashToken, 'hashToken');

  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new PaylinkConfigError('timeoutMs must be a positive number.');
  }

  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const fetchImpl = config.fetch ?? (globalThis.fetch as FetchLike | undefined);

  if (!fetchImpl) {
    throw new PaylinkConfigError(
      'No fetch implementation available. Use Node 18+ or pass `fetch` in the client config.',
    );
  }

  const resolved = { publicToken, baseUrl, timeoutMs, fetch: fetchImpl } as ResolvedConfig;

  return withHiddenSecret(resolved, hashToken);
}

/**
 * Attach the signing secret as a NON-ENUMERABLE property.
 *
 * `hashToken` stays readable as `config.hashToken` for signing, but it is
 * skipped by `JSON.stringify`, by `util.inspect` (so `console.log`), and by
 * object spread. Without this, every resource holds a reference to the config,
 * so `JSON.stringify(client)` — or any error reporter that serializes request
 * context — would dump the secret in plaintext once per namespace.
 */
function withHiddenSecret(resolved: ResolvedConfig, hashToken: string): ResolvedConfig {
  Object.defineProperty(resolved, 'hashToken', {
    value: hashToken,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  return resolved;
}

function requireNonEmpty(value: string | undefined, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PaylinkConfigError(`${name} is required and must be a non-empty string.`);
  }

  return value;
}
