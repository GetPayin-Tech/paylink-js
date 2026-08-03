/**
 * Base class for every error thrown by the SDK. Catch this to handle any
 * PayLink failure generically, or narrow to a subclass for specific handling.
 */
export class PaylinkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'PaylinkError';
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the client is constructed with missing or invalid configuration
 * (e.g. an empty public/hash token, or no `fetch` implementation available).
 */
export class PaylinkConfigError extends PaylinkError {
  constructor(message: string) {
    super(message);
    this.name = 'PaylinkConfigError';
  }
}

/**
 * Thrown when the API responds with a non-success envelope
 * (`{ success: false }`) or a non-2xx status. Carries the HTTP `status`, the
 * server-provided field `errors` (keyed by field), and the `raw` response body
 * (parsed, or the raw text if it was not valid JSON) for inspection.
 *
 * Use `isIdempotencyConflict` (409) and `isForbidden` (403 — e.g. a product
 * such as card tokenization or recurring payments is not enabled for the
 * account) to branch on the common cases without matching on status codes.
 */
export class PaylinkApiError extends PaylinkError {
  readonly status: number;

  readonly errors?: Record<string, unknown>;

  readonly raw: unknown;

  constructor(
    message: string,
    params: { status: number; errors?: Record<string, unknown>; raw?: unknown },
  ) {
    super(message);
    this.name = 'PaylinkApiError';
    this.status = params.status;
    this.errors = params.errors;
    this.raw = params.raw;
  }

  /** True when the API rejected the request as a duplicate (idempotency conflict). */
  get isIdempotencyConflict(): boolean {
    return this.status === 409;
  }

  /**
   * True when the API forbade the request (HTTP 403) — typically because the
   * relevant product (e.g. card tokenization or recurring payments) is not
   * enabled for the integration's account.
   */
  get isForbidden(): boolean {
    return this.status === 403;
  }
}

/**
 * Thrown by `webhooks.verify()` when a webhook payload's signature does not
 * match the value recomputed from the `hashToken`.
 */
export class PaylinkSignatureError extends PaylinkError {
  constructor(message = 'Webhook signature verification failed.') {
    super(message);
    this.name = 'PaylinkSignatureError';
  }
}

/**
 * Thrown when the request never produced an HTTP response — a network failure,
 * DNS error, or the configured timeout elapsing before the server replied.
 */
export class PaylinkConnectionError extends PaylinkError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PaylinkConnectionError';
  }
}
