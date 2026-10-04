export type ProviderErrorCode =
  | "timeout"
  | "unavailable"
  | "unauthorized"
  | "schema_mismatch"
  | "not_found"
  | "rate_limited"
  | "unknown";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly provider: string;
  readonly statusCode?: number;
  readonly details?: unknown;

  constructor(
    message: string,
    opts: {
      code: ProviderErrorCode;
      provider: string;
      statusCode?: number;
      details?: unknown;
      cause?: unknown;
    },
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "ProviderError";
    this.code = opts.code;
    this.provider = opts.provider;
    this.statusCode = opts.statusCode;
    this.details = opts.details;
  }
}

export function classifyHttpStatus(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unavailable";
  return "unknown";
}

const SECRET_KEYS = /password|token|authorization|api[_-]?key|secret|credential/i;

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? "[redacted]" : redactSecrets(v);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 200) {
    return `${value.slice(0, 80)}…[truncated]`;
  }
  return value;
}
