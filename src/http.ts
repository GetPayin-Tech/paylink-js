import type { FetchResponse, ResolvedConfig } from './config';
import { PaylinkApiError, PaylinkConnectionError } from './errors';
import { VERSION } from './version';

/**
 * Options for a single API request.
 *
 * - `path` — begins with a slash, e.g. `/api/v2/integration/init`.
 * - `body` — JSON body for POSTs; already string-coerced wire fields.
 * - `query` — query parameters (used for the recurring status GET).
 * - `idempotencyKey` — sent as the `Idempotency-Key` header when provided.
 * - `signal` — optional caller abort signal, combined with the timeout.
 * - `replaySafe` — overrides the default replay-safety rule (a plain POST is
 *   never retried). Set `true` for POSTs that are safe to replay — pure reads
 *   (check-status), or writes the server dedupes on an `Idempotency-Key`
 *   (refund, recurring.create).
 */
export interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, string>;
  query?: Record<string, string>;
  idempotencyKey?: string;
  signal?: AbortSignal;
  replaySafe?: boolean;
}

const RETRY_MAX_DELAY_MS = 8_000;

const RUNTIME_SUFFIX =
  typeof process !== 'undefined' && process.versions?.node ? ` node/${process.versions.node}` : '';

/** Sent on every request so server-side logs can attribute traffic to a version. */
export const USER_AGENT = `paylink-js/${VERSION}${RUNTIME_SUFFIX}`;

/**
 * Execute a request against the integration API and return the `data` payload
 * of the success envelope. Throws {@link PaylinkApiError} for non-success
 * responses and {@link PaylinkConnectionError} for network/timeout failures.
 *
 * Retries transient failures (429, 5xx, network errors, timeouts) with
 * exponential backoff and full jitter, honoring `Retry-After` when the server
 * sends it. A request is only ever replayed when doing so cannot double-charge:
 * GETs, and calls the resource layer explicitly flags `replaySafe` (check-status,
 * and refund / recurring.create when an `Idempotency-Key` is supplied). A bare
 * `vcc.charge` or `cards.charge` is NEVER retried, even if the caller passes a key.
 */
export async function execute<T>(config: ResolvedConfig, options: RequestOptions): Promise<T> {
  // An already-aborted signal never fires an `abort` event, so the listener
  // below would never run and the request would be sent anyway — for a payments
  // API that means charging after the caller has cancelled. Check up front.
  if (options.signal?.aborted) {
    throw new PaylinkConnectionError(`Request to ${options.path} was aborted before it was sent.`, {
      cause: options.signal.reason,
    });
  }

  const maxAttempts = isReplaySafe(options) ? config.maxRetries + 1 : 1;

  for (let attempt = 1; ; attempt++) {
    try {
      return await attemptRequest<T>(config, options);
    } catch (error) {
      if (attempt >= maxAttempts || !isTransient(error, options.signal)) {
        throw error;
      }

      await sleep(backoffMs(config, error, attempt), options.signal, options.path);
    }
  }
}

/**
 * Whether replaying this request is safe. Reads (GETs) are always safe. A write
 * is replayed only when the resource method explicitly flags it `replaySafe` —
 * done solely for endpoints the server actually dedupes (check-status, and
 * refund / recurring.create when an `Idempotency-Key` is supplied). A
 * caller-supplied key alone does NOT make a write replay-safe: the charge
 * endpoints ignore the header, so inferring safety from it could double-charge.
 */
function isReplaySafe(options: RequestOptions): boolean {
  return options.replaySafe ?? (options.method === 'GET');
}

/** Whether the failure is worth another attempt. */
function isTransient(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) {
    return false;
  }

  if (error instanceof PaylinkConnectionError) {
    return true;
  }

  if (error instanceof PaylinkApiError) {
    return error.status === 429 || error.status >= 500;
  }

  return false;
}

/**
 * Exponential backoff with full jitter, bounded by {@link RETRY_MAX_DELAY_MS}.
 * A server-sent `Retry-After` wins over the computed delay.
 */
function backoffMs(config: ResolvedConfig, error: unknown, attempt: number): number {
  if (error instanceof PaylinkApiError && error.retryAfterMs !== undefined) {
    return Math.min(error.retryAfterMs, RETRY_MAX_DELAY_MS);
  }

  const ceiling = Math.min(config.retryBaseDelayMs * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);

  return Math.random() * ceiling;
}

function sleep(ms: number, signal: AbortSignal | undefined, path: string): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    function cleanup(): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }

    function onAbort(): void {
      cleanup();
      reject(
        new PaylinkConnectionError(`Request to ${path} was aborted while waiting to retry.`, {
          cause: signal?.reason,
        }),
      );
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** One attempt: send, then map the response onto the success envelope or an error. */
async function attemptRequest<T>(config: ResolvedConfig, options: RequestOptions): Promise<T> {
  const url = buildUrl(config.baseUrl, options.path, options.query);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': USER_AGENT,
  };
  let body: string | undefined;

  if (options.method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body ?? {});
  }

  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  const controller = new AbortController();
  const onAbort = (): void => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  let response: FetchResponse;

  try {
    response = await config.fetch(url, { method: options.method, headers, body, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !options.signal?.aborted) {
      throw new PaylinkConnectionError(
        `Request to ${options.path} timed out after ${config.timeoutMs}ms.`,
        { cause: error },
      );
    }

    throw new PaylinkConnectionError(`Request to ${options.path} failed.`, { cause: error });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }

  const rawText = await response.text().catch(() => '');
  const parsed = safeJsonParse(rawText);

  if (!response.ok || isFailureEnvelope(parsed)) {
    throw toApiError(
      response.status,
      parsed,
      rawText,
      parseRetryAfter(response.headers.get('Retry-After')),
    );
  }

  if (parsed !== null && typeof parsed === 'object' && 'data' in (parsed as Record<string, unknown>)) {
    return (parsed as { data: T }).data;
  }

  return parsed as T;
}

/** `Retry-After` is either delta-seconds or an HTTP date. Returns milliseconds. */
function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || value.trim() === '') {
    return undefined;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const timestamp = Date.parse(value);

  if (Number.isFinite(timestamp)) {
    return Math.max(0, timestamp - Date.now());
  }

  return undefined;
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, string>): string {
  const url = `${baseUrl}${path}`;

  if (!query || Object.keys(query).length === 0) {
    return url;
  }

  const search = new URLSearchParams(query).toString();

  return `${url}?${search}`;
}

function safeJsonParse(text: string): unknown {
  if (text.trim() === '') {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isFailureEnvelope(parsed: unknown): boolean {
  return (
    parsed !== null &&
    typeof parsed === 'object' &&
    'success' in (parsed as Record<string, unknown>) &&
    (parsed as { success: unknown }).success === false
  );
}

function toApiError(
  status: number,
  parsed: unknown,
  rawText: string,
  retryAfterMs?: number,
): PaylinkApiError {
  const envelope = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const nestedData = envelope.data !== null && typeof envelope.data === 'object' ? (envelope.data as Record<string, unknown>) : {};
  const message =
    firstString(envelope.message, nestedData.message) ??
    `PayLink API request failed with status ${status}.`;
  const errors =
    envelope.errors !== null && typeof envelope.errors === 'object'
      ? (envelope.errors as Record<string, unknown>)
      : undefined;

  return new PaylinkApiError(message, { status, errors, raw: parsed ?? rawText, retryAfterMs });
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }

  return undefined;
}
