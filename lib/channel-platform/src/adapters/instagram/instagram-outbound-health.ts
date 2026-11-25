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
  /** IG_ID from /me `user_id` when present (messaging id). */
  resolvedInstagramBusinessAccountId?: string;
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

/** Instagram Login Graph returns both `id` (app-scoped) and `user_id` (IG_ID). */
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

type IgMeProfile = {
  userId?: string;
  appScopedId?: string;
  username?: string;
  name?: string;
  accountType?: string;
};

/**
 * Meta docs sometimes show /me as a flat object and sometimes as `{ data: [...] }`.
 * Prefer `user_id` (IG_ID) over app-scoped `id`.
 */
export function parseInstagramLoginMeProfile(body: unknown): IgMeProfile {
  if (!body || typeof body !== "object") return {};
  const root = body as Record<string, unknown>;
  const row =
    Array.isArray(root.data) && root.data[0] && typeof root.data[0] === "object"
      ? (root.data[0] as Record<string, unknown>)
      : root;
  const userId = row.user_id != null ? String(row.user_id).trim() : undefined;
  const appScopedId = row.id != null ? String(row.id).trim() : undefined;
  const username = row.username != null ? String(row.username).trim() : undefined;
  const name = row.name != null ? String(row.name).trim() : undefined;
  const accountType = row.account_type != null ? String(row.account_type).trim() : undefined;
  return {
    userId: userId || undefined,
    appScopedId: appScopedId || undefined,
    username: username || undefined,
    name: name || undefined,
    accountType: accountType || undefined,
  };
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
  const configuredId = config.instagramBusinessAccountId.trim();

  const report: InstagramOutboundHealthReport = {
    ok: false,
    latencyMs: 0,
    credentialSource: "company_instagram_settings",
    endpoint: `${instagramGraphBaseUrl(apiVersion)}/${encodeURIComponent(configuredId)}/messages`,
    graphApiVersion: apiVersion,
    instagramBusinessAccountId: configuredId,
    pageId: config.pageId ?? null,
    accessToken: {
      valid: false,
      prefix: config.accessToken.slice(0, 8) + "...",
      source: "company_instagram_settings",
    },
    instagramAccount: { ok: false },
    sendProbe: { ok: false },
  };

  let resolvedIgId = configuredId;

  try {
    // Instagram Login: /me is the source of truth. `user_id` is IG_ID; `id` is app-scoped only.
    const meRes = await fetchFn(
      `${instagramGraphBaseUrl(apiVersion)}/me?fields=user_id,id,username,name,account_type`,
      {
        headers: { Authorization: `Bearer ${config.accessToken}` },
        signal,
      },
    );
    const meRaw = (await meRes.json()) as {
      error?: { message?: string; code?: number };
    };
    if (!meRes.ok) {
      const err = readMetaError(meRaw);
      report.error = err.message;
      report.metaErrorCode = err.code;
      report.instagramAccount = { ok: false, error: err.message, metaErrorCode: err.code };
    } else {
      const me = parseInstagramLoginMeProfile(meRaw);
      report.accessToken.valid = true;
      report.accessToken.ownerId = me.userId || me.appScopedId;
      report.accessToken.ownerName = me.name ?? me.username;

      if (me.userId) {
        resolvedIgId = me.userId;
        report.resolvedInstagramBusinessAccountId = me.userId;
      }

      // Never treat app-scoped `id` as the messaging account id.
      // Account is healthy when /me returns a professional profile (username or user_id).
      const accountType = (me.accountType ?? "").toUpperCase();
      const personalBlocked = accountType === "PERSONAL";
      if (personalBlocked) {
        report.instagramAccount = {
          ok: false,
          username: me.username,
          name: me.name,
          error: "Personal Instagram accounts are not supported",
        };
      } else if (me.userId || me.username) {
        report.instagramAccount = {
          ok: true,
          username: me.username,
          name: me.name,
        };
      } else {
        report.instagramAccount = {
          ok: false,
          error: "Instagram professional account profile missing user_id/username",
        };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.error = message;
    report.instagramAccount = { ok: false, error: message };
  }

  report.endpoint = `${instagramGraphBaseUrl(apiVersion)}/${encodeURIComponent(resolvedIgId)}/messages`;

  try {
    const sendRes = await fetchFn(report.endpoint, {
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
    } else if (sendRes.ok) {
      report.sendProbe = { ok: true };
    } else {
      const err = readMetaError(sendBody);
      report.sendProbe = { ok: false, error: err.message, metaErrorCode: err.code };
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
    report.error =
      report.instagramAccount.error ?? report.sendProbe.error ?? "Instagram outbound health check failed";
    report.metaErrorCode = report.instagramAccount.metaErrorCode ?? report.sendProbe.metaErrorCode;
  }

  return report;
}
