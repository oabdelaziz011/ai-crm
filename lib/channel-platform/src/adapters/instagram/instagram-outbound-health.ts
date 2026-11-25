import { instagramGraphBaseUrl } from "./instagram-config.js";
import type { InstagramChannelConfiguration } from "./instagram-config.js";

export type InstagramHealthCheckDetail = {
  ok: boolean;
  error?: string;
  metaErrorCode?: number;
  username?: string;
  name?: string;
};

export type InstagramOutboundHealthReport = {
  ok: boolean;
  latencyMs: number;
  error?: string;
  metaErrorCode?: number;
  credentialSource: "company_instagram_settings";
  endpoint: string;
  graphApiVersion: string;
  instagramBusinessAccountId: string;
  pageId: string | null;
  accessToken: {
    valid: boolean;
    ownerId?: string;
    ownerName?: string;
    prefix: string;
    source: "company_instagram_settings";
  };
  instagramAccount: InstagramHealthCheckDetail;
  sendProbe: InstagramHealthCheckDetail;
};

function readMetaError(body: { error?: { message?: string; code?: number } }): {
  message: string;
  code?: number;
} {
  return {
    message: body.error?.message ?? "Meta API request failed",
    code: body.error?.code,
  };
}

/** Instagram Login Graph returns both `id` and `user_id`; OAuth persists `user_id`. */
export function collectInstagramGraphIds(
  ...values: Array<string | number | null | undefined>
): string[] {
  const ids: string[] = [];
  for (const value of values) {
    if (value == null) continue;
    const trimmed = String(value).trim();
    if (trimmed && !ids.includes(trimmed)) {
      ids.push(trimmed);
    }
  }
  return ids;
}

export function matchesConfiguredInstagramAccountId(
  configuredId: string,
  ...candidates: Array<string | number | null | undefined>
): boolean {
  const expected = configuredId.trim();
  if (!expected) return false;
  return collectInstagramGraphIds(...candidates).includes(expected);
}

export type InstagramOutboundHealthInput = {
  companyId: string;
  runtimeConfig: InstagramChannelConfiguration;
  fetchFn?: typeof fetch;
  /** Optional abort (e.g. route-level health timeout) so Graph fetches do not hang past the budget. */
  signal?: AbortSignal;
};

export async function performInstagramOutboundHealthCheck(
  input: InstagramOutboundHealthInput,
): Promise<InstagramOutboundHealthReport> {
  const fetchFn = input.fetchFn ?? globalThis.fetch.bind(globalThis);
  const signal = input.signal;
  const started = Date.now();
  const config = input.runtimeConfig;
  const apiVersion = config.apiVersion ?? "v21.0";
  const endpoint = `${instagramGraphBaseUrl(apiVersion)}/${encodeURIComponent(config.instagramBusinessAccountId)}/messages`;

  const report: InstagramOutboundHealthReport = {
    ok: false,
    latencyMs: 0,
    credentialSource: "company_instagram_settings",
    endpoint,
    graphApiVersion: apiVersion,
    instagramBusinessAccountId: config.instagramBusinessAccountId,
    pageId: config.pageId ?? null,
    accessToken: {
      valid: false,
      prefix: config.accessToken.slice(0, 8) + "...",
      source: "company_instagram_settings",
    },
    instagramAccount: { ok: false },
    sendProbe: { ok: false },
  };

  let meUserId: string | undefined;
  let meId: string | undefined;

  try {
    // Match OAuth profile fields: Instagram Login exposes messaging id as `user_id`.
    const meRes = await fetchFn(
      `${instagramGraphBaseUrl(apiVersion)}/me?fields=user_id,id,username,name`,
      {
        headers: { Authorization: `Bearer ${config.accessToken}` },
        signal,
      },
    );
    const meBody = (await meRes.json()) as {
      user_id?: string | number;
      id?: string | number;
      username?: string;
      name?: string;
      error?: { message?: string; code?: number };
    };
    if (!meRes.ok) {
      const err = readMetaError(meBody);
      report.error = err.message;
      report.metaErrorCode = err.code;
    } else {
      report.accessToken.valid = true;
      meUserId = meBody.user_id != null ? String(meBody.user_id).trim() : undefined;
      meId = meBody.id != null ? String(meBody.id).trim() : undefined;
      report.accessToken.ownerId = meUserId || meId;
      report.accessToken.ownerName = meBody.name ?? meBody.username;
    }
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  }

  try {
    const accountRes = await fetchFn(
      `${instagramGraphBaseUrl(apiVersion)}/${encodeURIComponent(config.instagramBusinessAccountId)}?fields=id,user_id,username,name`,
      { headers: { Authorization: `Bearer ${config.accessToken}` }, signal },
    );
    const accountBody = (await accountRes.json()) as {
      id?: string | number;
      user_id?: string | number;
      username?: string;
      name?: string;
      error?: { message?: string; code?: number };
    };
    if (!accountRes.ok) {
      const err = readMetaError(accountBody);
      report.instagramAccount = { ok: false, error: err.message, metaErrorCode: err.code };
    } else {
      // OAuth stores Instagram Login `user_id`. Node lookups often echo a different `id`.
      // Accept either Graph identifier, or a /me identifier that matches the configured id.
      const idsMatch = matchesConfiguredInstagramAccountId(
        config.instagramBusinessAccountId,
        accountBody.id,
        accountBody.user_id,
        meUserId,
        meId,
      );
      // Path was the configured id and Graph resolved a profile → alias is valid.
      const resolvedAlias =
        !idsMatch &&
        Boolean(String(accountBody.username ?? accountBody.name ?? "").trim());
      report.instagramAccount = {
        ok: idsMatch || resolvedAlias,
        username: accountBody.username,
        name: accountBody.name,
        error:
          idsMatch || resolvedAlias ? undefined : "Instagram Business Account ID mismatch",
      };
    }
  } catch (error) {
    report.instagramAccount = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const sendRes = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      signal,
      body: JSON.stringify({
        recipient: { id: "0" },
        message: { text: "health-check-probe" },
      }),
    });
    const sendBody = (await sendRes.json()) as { error?: { message?: string; code?: number } };
    if (sendRes.status === 403 || sendRes.status === 400) {
      const err = readMetaError(sendBody);
      report.sendProbe = {
        ok: sendRes.status === 400,
        error: err.message,
        metaErrorCode: err.code,
      };
    } else {
      report.sendProbe = { ok: true };
    }
  } catch (error) {
    report.sendProbe = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  report.ok = report.accessToken.valid && report.instagramAccount.ok;
  report.latencyMs = Date.now() - started;

  if (!report.error && !report.ok) {
    report.error = report.instagramAccount.error ?? report.sendProbe.error ?? "Instagram outbound health check failed";
    report.metaErrorCode = report.instagramAccount.metaErrorCode ?? report.sendProbe.metaErrorCode;
  }

  return report;
}
