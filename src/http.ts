import type { ResolvedConfig } from './config';
import { PaylinkApiError, PaylinkConnectionError } from './errors';

/**
 * Options for a single API request.
 *
 * - `path` — begins with a slash, e.g. `/api/v2/integration/init`.
 * - `body` — JSON body for POSTs; already string-coerced wire fields.
 * - `query` — query parameters (used for the recurring status GET).
 * - `idempotencyKey` — sent as the `Idempotency-Key` header when provided.
 * - `signal` — optional caller abort signal, combined with the timeout.
 */
export interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, string>;
  query?: Record<string, string>;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/**
 * Execute a request against the integration API and return the `data` payload
 * of the success envelope. Throws {@link PaylinkApiError} for non-success
 * responses and {@link PaylinkConnectionError} for network/timeout failures.
 */
export async function execute<T>(config: ResolvedConfig, options: RequestOptions): Promise<T> {
  const url = buildUrl(config.baseUrl, options.path, options.query);

  const headers: Record<string, string> = { Accept: 'application/json' };
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

  let response;

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
    throw toApiError(response.status, parsed, rawText);
  }

  if (parsed !== null && typeof parsed === 'object' && 'data' in (parsed as Record<string, unknown>)) {
    return (parsed as { data: T }).data;
  }

  return parsed as T;
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

function toApiError(status: number, parsed: unknown, rawText: string): PaylinkApiError {
  const envelope = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const nestedData = envelope.data !== null && typeof envelope.data === 'object' ? (envelope.data as Record<string, unknown>) : {};
  const message =
    firstString(envelope.message, nestedData.message) ??
    `PayLink API request failed with status ${status}.`;
  const errors =
    envelope.errors !== null && typeof envelope.errors === 'object'
      ? (envelope.errors as Record<string, unknown>)
      : undefined;

  return new PaylinkApiError(message, { status, errors, raw: parsed ?? rawText });
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }

  return undefined;
}
