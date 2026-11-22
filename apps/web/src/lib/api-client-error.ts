/** Structured API failure - preserves `error_key` after Axios normalization. */
export class ApiClientError extends Error {
  readonly status?: number;
  readonly errorKey?: string;

  constructor(
    message: string,
    opts?: {
      status?: number;
      errorKey?: string;
    },
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = opts?.status;
    this.errorKey = (opts?.errorKey || "").trim() || undefined;
  }
}

export function isApiClientError(err: unknown): err is ApiClientError {
  // Duck-type: `instanceof` fails when the class is loaded twice (SSR / HMR /
  // multi-entry). Name + optional errorKey/status is enough for our mappers.
  if (err instanceof ApiClientError) return true;
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; errorKey?: unknown; status?: unknown };
  return e.name === "ApiClientError";
}
