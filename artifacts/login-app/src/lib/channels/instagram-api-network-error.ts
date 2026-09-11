export function isBrowserNetworkFetchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|networkerror|load failed|fetch failed/i.test(message);
}

/** Maps opaque browser network TypeErrors into an actionable Instagram API error. */
export function mapInstagramApiNetworkError(error: unknown, url: string): Error {
  if (isBrowserNetworkFetchError(error)) {
    return new Error(
      `Cannot reach Instagram API at ${url}. The browser never received a JSON response (network, TLS, tunnel timeout, or blocked preflight).`,
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}
