import {
  isBrowserNetworkFetchError,
  mapInstagramApiNetworkError,
} from "@/lib/channels/instagram-api-network-error";

export type InstagramOutboundHealthResponse = {
  ok: boolean;
  latencyMs: number;
  error?: string;
  metaErrorCode?: number;
  instagramBusinessAccountId: string;
  pageId: string | null;
  accessToken: {
    valid: boolean;
    ownerId?: string;
    ownerName?: string;
  };
  instagramAccount: {
    ok: boolean;
    username?: string;
    name?: string;
    error?: string;
  };
  sendProbe: {
    ok: boolean;
    error?: string;
  };
};

/** Ensures Cloudflare-generated 5xx prefer structured JSON over HTML. */
export function buildInstagramHealthRequestHeaders(
  authHeaders: Record<string, string>,
): Record<string, string> {
  return {
    ...authHeaders,
    Accept: "application/json",
  };
}

export function isInstagramHealthNonJson5xx(status: number, jsonParseFailed: boolean): boolean {
  return jsonParseFailed && status >= 500 && status <= 599;
}

type AttemptFailure = {
  retryable: boolean;
  error: Error;
};

function asAttemptFailure(error: unknown): AttemptFailure {
  if (
    error &&
    typeof error === "object" &&
    "retryable" in error &&
    "error" in error &&
    typeof (error as AttemptFailure).retryable === "boolean" &&
    (error as AttemptFailure).error instanceof Error
  ) {
    return error as AttemptFailure;
  }
  return {
    retryable: false,
    error: error instanceof Error ? error : new Error(String(error)),
  };
}

async function requestInstagramOutboundHealthOnce(input: {
  url: string;
  headers: Record<string, string>;
  body: string;
  fetchFn: typeof fetch;
}): Promise<InstagramOutboundHealthResponse> {
  let response: Response;
  try {
    response = await input.fetchFn(input.url, {
      method: "POST",
      headers: input.headers,
      credentials: "include",
      body: input.body,
    });
  } catch (error) {
    throw {
      retryable: isBrowserNetworkFetchError(error),
      error: mapInstagramApiNetworkError(error, input.url),
    } satisfies AttemptFailure;
  }

  const raw = await response.text();
  let payload: InstagramOutboundHealthResponse & { error?: string; message?: string };
  try {
    payload = JSON.parse(raw) as InstagramOutboundHealthResponse & {
      error?: string;
      message?: string;
    };
  } catch {
    const nonJsonError = new Error(
      `Instagram API returned non-JSON (${response.status}) from ${input.url}`,
    );
    throw {
      retryable: isInstagramHealthNonJson5xx(response.status, true),
      error: nonJsonError,
    } satisfies AttemptFailure;
  }

  // Completed health evaluations may historically have used HTTP 502 with a JSON
  // report body. Prefer the report when present so the UI can show Meta errors.
  if (
    typeof (payload as { ok?: unknown }).ok === "boolean" &&
    (response.ok || response.status === 502)
  ) {
    return payload as InstagramOutboundHealthResponse;
  }

  if (!response.ok) {
    throw {
      retryable: false,
      error: new Error(
        payload.message ?? payload.error ?? `Instagram API failed (${response.status})`,
      ),
    } satisfies AttemptFailure;
  }

  return payload;
}

/**
 * Instagram Connection Health POST with Accept: application/json and exactly one
 * retry on browser network failures or non-JSON 5xx (e.g. Cloudflare HTML 502).
 */
export async function requestInstagramOutboundHealth(input: {
  apiBase: string;
  companyId: string;
  companyChannelId: string;
  authHeaders: Record<string, string>;
  fetchFn?: typeof fetch;
}): Promise<InstagramOutboundHealthResponse> {
  const url = `${input.apiBase}/instagram/channel-outbound-health`;
  const headers = buildInstagramHealthRequestHeaders(input.authHeaders);
  const body = JSON.stringify({
    companyId: input.companyId,
    companyChannelId: input.companyChannelId,
  });
  const fetchFn = input.fetchFn ?? globalThis.fetch.bind(globalThis);

  try {
    return await requestInstagramOutboundHealthOnce({ url, headers, body, fetchFn });
  } catch (firstError) {
    const failure = asAttemptFailure(firstError);
    if (!failure.retryable) {
      throw failure.error;
    }
    try {
      return await requestInstagramOutboundHealthOnce({ url, headers, body, fetchFn });
    } catch (secondError) {
      throw asAttemptFailure(secondError).error;
    }
  }
}
