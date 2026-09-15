import { instagramGraphBaseUrl } from "./instagram-config.js";
import {
  INSTAGRAM_WEBHOOK_APP_ID_ENV,
  INSTAGRAM_WEBHOOK_APP_SECRET_ENV,
} from "./instagram-webhook-signature-secrets.js";

/** Published Meta app currently configured in env (public App ID, not a secret). */
export const META_FACEBOOK_APP_ID_APP1 = "1093065463072724";
/** Previous Instagram-oriented Meta app that may still own a leftover webhook. */
export const META_FACEBOOK_APP_ID_APP1_IG = "1384216956603038";

export type KnownMetaAppClassification = "app1" | "app1_ig" | "other";

export type InstagramWebhookCallbackSummary = {
  object: string;
  callbackHost: string | null;
  callbackPath: string | null;
  fields: string[];
  active: boolean | null;
  matchesInstagramWebhookPath: boolean;
};

export type InstagramWebhookAppOwnershipReport = {
  inspectedAt: string;
  envAppIdIsDiagnosticOnly: true;
  hmacDoesNotUseAppId: true;
  companyId: string;
  companyChannelId: string | null;
  instagramBusinessAccountId: string | null;
  configuredFacebookAppId: string | null;
  configuredFacebookAppClassification: KnownMetaAppClassification | null;
  envAppSecretPresent: boolean;
  envAppSecretLength: number | null;
  expectedWebhookHost: string | null;
  expectedWebhookPath: string;
  facebookAppSecretCheck: {
    ok: boolean;
    appId: string | null;
    appName: string | null;
    matchesConfiguredAppId: boolean | null;
    httpStatus: number | null;
    metaErrorCode: number | null;
    error: string | null;
  };
  facebookAppSubscriptions: {
    ok: boolean;
    httpStatus: number | null;
    metaErrorCode: number | null;
    error: string | null;
    objects: InstagramWebhookCallbackSummary[];
    hasInstagramObject: boolean;
    instagramCallbackMatchesThisServer: boolean | null;
  };
  instagramAccessTokenDebug: {
    ok: boolean;
    httpStatus: number | null;
    metaErrorCode: number | null;
    error: string | null;
    isValid: boolean | null;
    type: string | null;
    appId: string | null;
    appClassification: KnownMetaAppClassification | null;
  };
  instagramSubscribedApps: {
    ok: boolean;
    httpStatus: number | null;
    metaErrorCode: number | null;
    error: string | null;
    appIds: string[];
    classifications: KnownMetaAppClassification[];
    subscribedFields: string[];
    includesConfiguredFacebookApp: boolean;
    includesLegacyApp1Ig: boolean;
  };
  conclusions: {
    envSecretBelongsToConfiguredFacebookApp: boolean | null;
    configuredAppAppearsToOwnDashboardWebhook: boolean | null;
    accessTokenIssuedByConfiguredFacebookApp: boolean | null;
    accessTokenIssuedByLegacyApp1Ig: boolean | null;
    accountSubscribedToConfiguredFacebookApp: boolean | null;
    accountSubscribedToLegacyApp1Ig: boolean | null;
    notes: string[];
    dashboardChecks: string[];
  };
};

type GraphErrorBody = {
  error?: {
    message?: string;
    code?: number;
    type?: string;
  };
};

export function classifyKnownMetaAppId(appId: string | null | undefined): KnownMetaAppClassification | null {
  const id = appId?.trim() ?? "";
  if (!id) return null;
  if (id === META_FACEBOOK_APP_ID_APP1) return "app1";
  if (id === META_FACEBOOK_APP_ID_APP1_IG) return "app1_ig";
  return "other";
}

export function sanitizeMetaErrorMessage(message: string | undefined | null): string | null {
  if (!message?.trim()) return null;
  return message
    .replace(/https?:\/\/[^\s]+/gi, "[url]")
    .replace(/\b(EAA|EAB|IGQW|IGA|IGAA)[A-Za-z0-9]+/g, "[token]")
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replace(/appsecret_proof=[^&\s]+/gi, "appsecret_proof=[redacted]");
}

export function parseWebhookCallback(callbackUrl: string | undefined | null): {
  callbackHost: string | null;
  callbackPath: string | null;
} {
  if (!callbackUrl?.trim()) return { callbackHost: null, callbackPath: null };
  try {
    const parsed = new URL(callbackUrl);
    return { callbackHost: parsed.hostname || null, callbackPath: parsed.pathname || null };
  } catch {
    return { callbackHost: null, callbackPath: null };
  }
}

export function matchesInstagramWebhookCallback(input: {
  callbackHost: string | null;
  callbackPath: string | null;
  expectedHost: string | null;
  expectedPath: string;
}): boolean {
  if (!input.callbackPath) return false;
  const pathMatches = input.callbackPath.replace(/\/+$/, "") === input.expectedPath.replace(/\/+$/, "")
    || input.callbackPath.includes("/api/webhooks/instagram");
  if (!pathMatches) return false;
  if (!input.expectedHost || !input.callbackHost) return pathMatches;
  return input.callbackHost.toLowerCase() === input.expectedHost.toLowerCase();
}

function readEnv(env: NodeJS.Dict<string>, key: string): string | null {
  const value = String(env[key] ?? "").trim();
  return value || null;
}

function facebookGraphBase(apiVersion: string): string {
  const version = apiVersion.trim() || "v21.0";
  return `https://graph.facebook.com/${version}`;
}

function expectedWebhookTarget(env: NodeJS.Dict<string>): { host: string | null; path: string } {
  const raw = readEnv(env, "VITE_WEBHOOK_BASE_URL") ?? readEnv(env, "WEBHOOK_BASE_URL") ?? "https://webhook.valueor.org";
  try {
    return { host: new URL(raw).hostname, path: "/api/webhooks/instagram" };
  } catch {
    return { host: null, path: "/api/webhooks/instagram" };
  }
}

async function graphGetJson(input: {
  url: string;
  accessToken: string;
  fetchFn: typeof fetch;
}): Promise<{ httpStatus: number; body: Record<string, unknown> }> {
  const url = new URL(input.url);
  url.searchParams.delete("access_token");
  const response = await input.fetchFn(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { httpStatus: response.status, body };
}

function graphError(body: Record<string, unknown>): { code: number | null; message: string | null } {
  const error = (body as GraphErrorBody).error;
  return {
    code: typeof error?.code === "number" ? error.code : null,
    message: sanitizeMetaErrorMessage(error?.message),
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    if (typeof value === "string" && value.trim()) {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
    return [];
  }
  const names: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      names.push(item.trim());
      continue;
    }
    if (item && typeof item === "object") {
      const name = asString((item as Record<string, unknown>).name);
      if (name) names.push(name);
    }
  }
  return names;
}

export async function inspectInstagramWebhookAppOwnership(input: {
  companyId: string;
  companyChannelId?: string | null;
  instagramBusinessAccountId?: string | null;
  accessToken?: string | null;
  apiVersion?: string | null;
  env?: NodeJS.Dict<string>;
  fetchFn?: typeof fetch;
}): Promise<InstagramWebhookAppOwnershipReport> {
  const env = input.env ?? process.env;
  const fetchFn = input.fetchFn ?? globalThis.fetch.bind(globalThis);
  const apiVersion = input.apiVersion?.trim() || "v21.0";
  const configuredFacebookAppId = readEnv(env, INSTAGRAM_WEBHOOK_APP_ID_ENV);
  const envAppSecret = readEnv(env, INSTAGRAM_WEBHOOK_APP_SECRET_ENV);
  const accessToken = input.accessToken?.trim() || null;
  const igUserId = input.instagramBusinessAccountId?.trim() || null;
  const webhookTarget = expectedWebhookTarget(env);

  const report: InstagramWebhookAppOwnershipReport = {
    inspectedAt: new Date().toISOString(),
    envAppIdIsDiagnosticOnly: true,
    hmacDoesNotUseAppId: true,
    companyId: input.companyId,
    companyChannelId: input.companyChannelId?.trim() || null,
    instagramBusinessAccountId: igUserId,
    configuredFacebookAppId,
    configuredFacebookAppClassification: classifyKnownMetaAppId(configuredFacebookAppId),
    envAppSecretPresent: Boolean(envAppSecret),
    envAppSecretLength: envAppSecret ? envAppSecret.length : null,
    expectedWebhookHost: webhookTarget.host,
    expectedWebhookPath: webhookTarget.path,
    facebookAppSecretCheck: {
      ok: false,
      appId: null,
      appName: null,
      matchesConfiguredAppId: null,
      httpStatus: null,
      metaErrorCode: null,
      error: null,
    },
    facebookAppSubscriptions: {
      ok: false,
      httpStatus: null,
      metaErrorCode: null,
      error: null,
      objects: [],
      hasInstagramObject: false,
      instagramCallbackMatchesThisServer: null,
    },
    instagramAccessTokenDebug: {
      ok: false,
      httpStatus: null,
      metaErrorCode: null,
      error: null,
      isValid: null,
      type: null,
      appId: null,
      appClassification: null,
    },
    instagramSubscribedApps: {
      ok: false,
      httpStatus: null,
      metaErrorCode: null,
      error: null,
      appIds: [],
      classifications: [],
      subscribedFields: [],
      includesConfiguredFacebookApp: false,
      includesLegacyApp1Ig: false,
    },
    conclusions: {
      envSecretBelongsToConfiguredFacebookApp: null,
      configuredAppAppearsToOwnDashboardWebhook: null,
      accessTokenIssuedByConfiguredFacebookApp: null,
      accessTokenIssuedByLegacyApp1Ig: null,
      accountSubscribedToConfiguredFacebookApp: null,
      accountSubscribedToLegacyApp1Ig: null,
      notes: [
        "INSTAGRAM_WEBHOOK_APP_ID is diagnostic only. HMAC uses App Secret bytes, not this App ID.",
        "Webhook POSTs are signed by the Meta app that owns the dashboard webhook subscription, which may differ from the app that issued the Instagram User Access Token.",
      ],
      dashboardChecks: [
        "Meta App Dashboard → App1 (1093065463072724) → Instagram → API setup with Instagram login → Webhooks: confirm Callback URL host is webhook.valueor.org and path is /api/webhooks/instagram, and that the subscription is attached to this app (not App1-IG).",
        "Meta App Dashboard → App1-IG (1384216956603038) → Instagram → API setup with Instagram login → Webhooks (and Webhooks product if present): if the same callback is still listed, that leftover app is the HMAC signer.",
        "On each of those apps, open Instagram → API setup with Instagram login → Business login settings and compare Instagram App ID to the subscribed_apps app_id from this diagnostic. That ID is not Settings → Basic → App ID.",
        "Compare Settings → Basic → App ID on the app that lists the live callback. That App ID’s Basic App Secret is the documented HMAC key. If Basic is already proven for App1 and HMAC still fails, try that same app’s Instagram App Secret from Business login settings locally — do not paste it into chat.",
      ],
    },
  };

  if (configuredFacebookAppId && envAppSecret) {
    const appToken = `${configuredFacebookAppId}|${envAppSecret}`;
    try {
      const appLookup = await graphGetJson({
        url: `${facebookGraphBase(apiVersion)}/${encodeURIComponent(configuredFacebookAppId)}?fields=id,name`,
        accessToken: appToken,
        fetchFn,
      });
      const appError = graphError(appLookup.body);
      const lookedUpId = asString(appLookup.body.id) ?? configuredFacebookAppId;
      report.facebookAppSecretCheck = {
        ok: appLookup.httpStatus >= 200 && appLookup.httpStatus < 300 && !appError.code,
        appId: lookedUpId,
        appName: asString(appLookup.body.name),
        matchesConfiguredAppId: lookedUpId === configuredFacebookAppId,
        httpStatus: appLookup.httpStatus,
        metaErrorCode: appError.code,
        error: appError.message,
      };
    } catch (error) {
      report.facebookAppSecretCheck.error =
        error instanceof Error ? sanitizeMetaErrorMessage(error.message) : "facebook_app_lookup_failed";
    }

    try {
      const subscriptions = await graphGetJson({
        url: `${facebookGraphBase(apiVersion)}/${encodeURIComponent(configuredFacebookAppId)}/subscriptions`,
        accessToken: appToken,
        fetchFn,
      });
      const subError = graphError(subscriptions.body);
      const rows = Array.isArray(subscriptions.body.data) ? subscriptions.body.data : [];
      const objects: InstagramWebhookCallbackSummary[] = rows
        .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
        .map((row) => {
          const callback = parseWebhookCallback(asString(row.callback_url));
          const objectName = asString(row.object) ?? "unknown";
          return {
            object: objectName,
            callbackHost: callback.callbackHost,
            callbackPath: callback.callbackPath,
            fields: asStringArray(row.fields),
            active: typeof row.active === "boolean" ? row.active : null,
            matchesInstagramWebhookPath: matchesInstagramWebhookCallback({
              callbackHost: callback.callbackHost,
              callbackPath: callback.callbackPath,
              expectedHost: webhookTarget.host,
              expectedPath: webhookTarget.path,
            }),
          };
        });
      const instagramObjects = objects.filter((item) => item.object.toLowerCase() === "instagram");
      report.facebookAppSubscriptions = {
        ok: subscriptions.httpStatus >= 200 && subscriptions.httpStatus < 300 && !subError.code,
        httpStatus: subscriptions.httpStatus,
        metaErrorCode: subError.code,
        error: subError.message,
        objects,
        hasInstagramObject: instagramObjects.length > 0,
        instagramCallbackMatchesThisServer:
          instagramObjects.length === 0 ? false : instagramObjects.some((item) => item.matchesInstagramWebhookPath),
      };
    } catch (error) {
      report.facebookAppSubscriptions.error =
        error instanceof Error ? sanitizeMetaErrorMessage(error.message) : "facebook_subscriptions_failed";
    }
  } else {
    report.facebookAppSecretCheck.error = configuredFacebookAppId
      ? "INSTAGRAM_WEBHOOK_APP_SECRET is missing"
      : "INSTAGRAM_WEBHOOK_APP_ID is missing";
    report.facebookAppSubscriptions.error = report.facebookAppSecretCheck.error;
  }

  if (accessToken) {
    try {
      const debugUrl = configuredFacebookAppId && envAppSecret
        ? `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}`
        : `${instagramGraphBaseUrl(apiVersion)}/debug_token?input_token=${encodeURIComponent(accessToken)}`;
      const debugToken = configuredFacebookAppId && envAppSecret
        ? `${configuredFacebookAppId}|${envAppSecret}`
        : accessToken;
      const debug = await graphGetJson({ url: debugUrl, accessToken: debugToken, fetchFn });
      const debugError = graphError(debug.body);
      const data =
        debug.body.data && typeof debug.body.data === "object"
          ? (debug.body.data as Record<string, unknown>)
          : debug.body;
      const tokenAppId = asString(data.app_id);
      report.instagramAccessTokenDebug = {
        ok: debug.httpStatus >= 200 && debug.httpStatus < 300 && !debugError.code,
        httpStatus: debug.httpStatus,
        metaErrorCode: debugError.code,
        error: debugError.message,
        isValid: typeof data.is_valid === "boolean" ? data.is_valid : null,
        type: asString(data.type),
        appId: tokenAppId,
        appClassification: classifyKnownMetaAppId(tokenAppId),
      };
    } catch (error) {
      report.instagramAccessTokenDebug.error =
        error instanceof Error ? sanitizeMetaErrorMessage(error.message) : "debug_token_failed";
    }

    if (!report.instagramAccessTokenDebug.ok && accessToken) {
      try {
        const igDebug = await graphGetJson({
          url: `${instagramGraphBaseUrl(apiVersion)}/debug_token?input_token=${encodeURIComponent(accessToken)}`,
          accessToken,
          fetchFn,
        });
        const igError = graphError(igDebug.body);
        const data =
          igDebug.body.data && typeof igDebug.body.data === "object"
            ? (igDebug.body.data as Record<string, unknown>)
            : igDebug.body;
        const tokenAppId = asString(data.app_id);
        if (igDebug.httpStatus >= 200 && igDebug.httpStatus < 300 && !igError.code && tokenAppId) {
          report.instagramAccessTokenDebug = {
            ok: true,
            httpStatus: igDebug.httpStatus,
            metaErrorCode: null,
            error: null,
            isValid: typeof data.is_valid === "boolean" ? data.is_valid : null,
            type: asString(data.type),
            appId: tokenAppId,
            appClassification: classifyKnownMetaAppId(tokenAppId),
          };
        }
      } catch {
        // Keep the original Facebook debug_token error.
      }
    }

    const subscribedTarget = igUserId ? encodeURIComponent(igUserId) : "me";
    try {
      const subscribed = await graphGetJson({
        url: `${instagramGraphBaseUrl(apiVersion)}/${subscribedTarget}/subscribed_apps`,
        accessToken,
        fetchFn,
      });
      const subError = graphError(subscribed.body);
      const rows = Array.isArray(subscribed.body.data) ? subscribed.body.data : [];
      const appIds: string[] = [];
      const fields = new Set<string>();
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const record = row as Record<string, unknown>;
        const appId = asString(record.app_id) ?? asString(record.id);
        if (appId && !appIds.includes(appId)) appIds.push(appId);
        for (const field of asStringArray(record.subscribed_fields ?? record.fields)) {
          fields.add(field);
        }
      }
      report.instagramSubscribedApps = {
        ok: subscribed.httpStatus >= 200 && subscribed.httpStatus < 300 && !subError.code,
        httpStatus: subscribed.httpStatus,
        metaErrorCode: subError.code,
        error: subError.message,
        appIds,
        classifications: appIds
          .map((id) => classifyKnownMetaAppId(id))
          .filter((value): value is KnownMetaAppClassification => Boolean(value)),
        subscribedFields: [...fields],
        includesConfiguredFacebookApp: Boolean(
          configuredFacebookAppId && appIds.includes(configuredFacebookAppId),
        ),
        includesLegacyApp1Ig: appIds.includes(META_FACEBOOK_APP_ID_APP1_IG),
      };
    } catch (error) {
      report.instagramSubscribedApps.error =
        error instanceof Error ? sanitizeMetaErrorMessage(error.message) : "subscribed_apps_failed";
    }
  } else {
    report.instagramAccessTokenDebug.error = "instagram_user_access_token_missing";
    report.instagramSubscribedApps.error = "instagram_user_access_token_missing";
  }

  const secretOk = report.facebookAppSecretCheck.ok && report.facebookAppSecretCheck.matchesConfiguredAppId === true;
  report.conclusions.envSecretBelongsToConfiguredFacebookApp = configuredFacebookAppId
    ? envAppSecret
      ? secretOk
      : false
    : null;
  report.conclusions.configuredAppAppearsToOwnDashboardWebhook = report.facebookAppSubscriptions.ok
    ? report.facebookAppSubscriptions.hasInstagramObject &&
      report.facebookAppSubscriptions.instagramCallbackMatchesThisServer === true
    : null;
  report.conclusions.accessTokenIssuedByConfiguredFacebookApp =
    report.instagramAccessTokenDebug.appId && configuredFacebookAppId
      ? report.instagramAccessTokenDebug.appId === configuredFacebookAppId
      : report.instagramAccessTokenDebug.appId
        ? false
        : null;
  report.conclusions.accessTokenIssuedByLegacyApp1Ig =
    report.instagramAccessTokenDebug.appId === META_FACEBOOK_APP_ID_APP1_IG;
  report.conclusions.accountSubscribedToConfiguredFacebookApp = report.instagramSubscribedApps.ok
    ? report.instagramSubscribedApps.includesConfiguredFacebookApp
    : null;
  report.conclusions.accountSubscribedToLegacyApp1Ig = report.instagramSubscribedApps.ok
    ? report.instagramSubscribedApps.includesLegacyApp1Ig
    : null;

  if (report.conclusions.envSecretBelongsToConfiguredFacebookApp === true) {
    report.conclusions.notes.push(
      "The env App Secret belongs to the configured Facebook App ID. If HMAC still fails, the POST is not signed by that app.",
    );
  } else if (report.conclusions.envSecretBelongsToConfiguredFacebookApp === false) {
    report.conclusions.notes.push(
      "The env App Secret does not authenticate as the configured Facebook App ID. It may be the Instagram Login OAuth secret, a different app’s Basic secret, or mistyped.",
    );
  }

  if (report.conclusions.configuredAppAppearsToOwnDashboardWebhook === false) {
    report.conclusions.notes.push(
      "Configured App1 does not show an Instagram webhook callback matching this server. A leftover App1-IG subscription can still be the signer.",
    );
  } else if (report.conclusions.configuredAppAppearsToOwnDashboardWebhook === true) {
    report.conclusions.notes.push(
      "Configured App1 lists an Instagram webhook callback on this server. HMAC should use that app’s Settings → Basic → App secret.",
    );
  }

  if (report.conclusions.accountSubscribedToLegacyApp1Ig) {
    report.conclusions.notes.push(
      "The Instagram professional account is still subscribed to App1-IG (1384216956603038).",
    );
  }

  if (report.instagramAccessTokenDebug.appClassification === "other" && report.instagramAccessTokenDebug.appId) {
    report.conclusions.notes.push(
      `debug_token returned app_id ${report.instagramAccessTokenDebug.appId}, which is neither App1 nor App1-IG. Compare it to Instagram → API setup with Instagram login → Instagram App ID (OAuth), which is distinct from Settings → Basic → App ID.`,
    );
  }

  for (const subscribedAppId of report.instagramSubscribedApps.appIds) {
    if (classifyKnownMetaAppId(subscribedAppId) === "other") {
      report.conclusions.notes.push(
        `subscribed_apps returned app_id ${subscribedAppId}, which is neither Facebook App1 (1093065463072724) nor App1-IG (1384216956603038). Compare this value to Instagram → API setup with Instagram login → Business login settings → Instagram App ID on each Meta app. Instagram Login uses that ID, not Settings → Basic → App ID.`,
      );
    }
  }

  if (!report.facebookAppSubscriptions.ok) {
    report.conclusions.notes.push(
      "Could not list App1 dashboard webhook subscriptions programmatically. Use the Meta Dashboard checks below.",
    );
  }

  return report;
}
