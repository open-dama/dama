/** Structured API failure - preserves `error_key` after Axios normalization. */
export class ApiClientError extends Error {
  readonly status?: number;
  readonly errorKey?: string;
  /** API `error` body string for fail-closed chrome surfaces only (not toast invent). */
  readonly apiError?: string;

  constructor(
    message: string,
    opts?: {
      status?: number;
      errorKey?: string;
      apiError?: string;
    },
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = opts?.status;
    this.errorKey = (opts?.errorKey || "").trim() || undefined;
    this.apiError = (opts?.apiError || "").trim() || undefined;
  }
}

export function isApiClientError(err: unknown): err is ApiClientError {
  // Duck-type: `instanceof` fails when the class is loaded twice (SSR / HMR).
  if (err instanceof ApiClientError) return true;
  if (!err || typeof err !== "object") return false;
  return (err as { name?: string }).name === "ApiClientError";
}
