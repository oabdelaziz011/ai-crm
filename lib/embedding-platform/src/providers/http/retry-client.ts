import { EmbeddingProviderRequestError, EmbeddingProviderTimeoutError } from "../../errors.js";

export type FetchWithRetryOptions = {
  timeoutMs: number;
  maxRetries: number;
  baseDelayMs?: number;
  fetchFn?: typeof fetch;
  retryOnStatuses?: number[];
  label?: string;
};

const DEFAULT_RETRY_STATUSES = [408, 429, 500, 502, 503, 504];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number, retryOnStatuses: number[]): boolean {
  return retryOnStatuses.includes(status);
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: FetchWithRetryOptions,
): Promise<Response> {
  const fetchFn = options.fetchFn ?? fetch;
  const retryOnStatuses = options.retryOnStatuses ?? DEFAULT_RETRY_STATUSES;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const label = options.label ?? "request";

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetchFn(url, {
        ...init,
        signal: controller.signal,
      });

      if (response.ok) {
        return response;
      }

      const body = await response.text().catch(() => "");
      if (attempt < options.maxRetries && isRetryableStatus(response.status, retryOnStatuses)) {
        await sleep(baseDelayMs * 2 ** attempt);
        continue;
      }

      throw new EmbeddingProviderRequestError(
        `${label} failed with HTTP ${response.status}${body ? `: ${body.slice(0, 240)}` : ""}`,
      );
    } catch (error) {
      if (error instanceof EmbeddingProviderRequestError) {
        throw error;
      }

      const aborted = error instanceof Error && error.name === "AbortError";
      lastError = aborted
        ? new EmbeddingProviderTimeoutError(`${label} timed out after ${options.timeoutMs}ms.`)
        : error instanceof Error
          ? error
          : new Error(String(error));

      if (attempt < options.maxRetries) {
        await sleep(baseDelayMs * 2 ** attempt);
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new EmbeddingProviderRequestError(`${label} failed after retries.`);
}
