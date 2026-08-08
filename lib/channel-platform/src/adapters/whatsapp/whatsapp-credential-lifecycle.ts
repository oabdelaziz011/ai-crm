import type { SupabaseClient } from "@supabase/supabase-js";
import { ValidationError } from "../../errors.js";
import { whatsAppGraphBaseUrl, type WhatsAppChannelConfiguration } from "./whatsapp-config.js";

export type WhatsAppTokenStatus = "valid" | "expired" | "invalid" | "unknown" | "missing";

export type WhatsAppCredentialHealth = {
  tokenStatus: WhatsAppTokenStatus;
  tokenExpiresAt: string | null;
  tokenCheckedAt: string | null;
  lastSuccessfulSendAt: string | null;
  lastAuthError: string | null;
  lastAuthErrorAt: string | null;
  lastAuthErrorCode: number | null;
};

export type WhatsAppCredentialHealthPatch = {
  tokenStatus?: WhatsAppTokenStatus;
  tokenExpiresAt?: string | null;
  clearTokenExpiresAt?: boolean;
  tokenCheckedAt?: string | null;
  lastSuccessfulSendAt?: string | null;
  lastAuthError?: string | null;
  clearLastAuthError?: boolean;
  lastAuthErrorAt?: string | null;
  lastAuthErrorCode?: number | null;
  clearLastAuthErrorCode?: boolean;
};

export type WhatsAppCredentialLifecyclePort = {
  loadHealth(companyId: string): Promise<WhatsAppCredentialHealth | null>;
  recordHealth(companyId: string, patch: WhatsAppCredentialHealthPatch): Promise<void>;
  notifyAdmins(
    companyId: string,
    detail: { title: string; message: string; minIntervalSeconds?: number },
  ): Promise<number>;
};

type MetaErrorBody = {
  error?: {
    message?: string;
    error_user_msg?: string;
    code?: number;
    type?: string;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

export type WhatsAppConnectionMismatch = {
  configuredPhoneNumberId: string;
  configuredWabaId: string | null;
  actualWabaIdFromMeta: string | null;
  /** Which configured value appears incorrect based on Meta responses. */
  incorrectValue: "phone_number_id" | "waba_id" | "access_token" | "unknown";
  wabaPhoneNumberIds?: string[];
  detail: string;
};

export type WhatsAppConnectionTestReport = {
  ok: boolean;
  latencyMs: number;
  error?: string;
  metaErrorCode?: number;
  metaErrorSubcode?: number;
  tokenStatus: WhatsAppTokenStatus;
  tokenExpiresAt: string | null;
  accessToken: {
    ok: boolean;
    error?: string;
    ownerId?: string;
    ownerName?: string;
  };
  phoneNumber: {
    ok: boolean;
    error?: string;
    id?: string;
    displayPhoneNumber?: string;
    verifiedName?: string;
    /** Owning WABA resolved from Meta for this phone number (when available). */
    owningWabaId?: string | null;
  };
  businessAccount: {
    ok: boolean;
    error?: string;
    id?: string;
    name?: string;
    phoneNumberBelongsToWaba?: boolean;
  };
  mismatch?: WhatsAppConnectionMismatch;
  debugToken?: {
    ok: boolean;
    error?: string;
    isValid?: boolean | null;
    expiresAt?: string | null;
    type?: string | null;
  };
};

export function maskAccessToken(token: string | null | undefined): string {
  const value = token?.trim() ?? "";
  if (!value) return "(empty)";
  if (value.length <= 10) return `${value.slice(0, 2)}…${value.slice(-2)}`;
  return `${value.slice(0, 6)}…${value.slice(-4)} (len=${value.length})`;
}

export function formatPhoneWabaMismatchError(input: {
  configuredPhoneNumberId: string;
  configuredWabaId: string | null;
  actualWabaIdFromMeta: string | null;
  incorrectValue: WhatsAppConnectionMismatch["incorrectValue"];
}): string {
  const incorrectLabel =
    input.incorrectValue === "phone_number_id"
      ? "Phone Number ID"
      : input.incorrectValue === "waba_id"
        ? "WABA ID (Business Account ID)"
        : input.incorrectValue === "access_token"
          ? "Access Token"
          : "unknown (Phone Number ID and/or WABA ID)";

  return [
    "Configured Phone Number ID is not registered on this WABA.",
    `Configured Phone Number ID: ${input.configuredPhoneNumberId || "(missing)"}`,
    `Actual WABA returned by Meta: ${input.actualWabaIdFromMeta ?? "(not returned)"}`,
    `Configured WABA: ${input.configuredWabaId ?? "(missing)"}`,
    `Incorrect value: ${incorrectLabel}`,
  ].join(" ");
}

function extractOwningWabaIdFromPhoneBody(body: Record<string, unknown>): string | null {
  const metadata = body.metadata;
  if (metadata && typeof metadata === "object") {
    const parent = (metadata as { parent?: { id?: string; type?: string } }).parent;
    const parentId = parent?.id?.trim();
    if (parentId) return parentId;
  }

  const waba = body.whatsapp_business_account;
  if (waba && typeof waba === "object") {
    const id = (waba as { id?: string }).id?.trim();
    if (id) return id;
  }

  return null;
}

const EXPIRED_SESSION_RE =
  /Session has expired on ([A-Za-z]+,\s+\d{2}-[A-Za-z]{3}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+[A-Z]+)/i;

export function classifyMetaAuthFailure(input: {
  message?: string | null;
  code?: number | null;
  subcode?: number | null;
}): {
  isAuthFailure: boolean;
  tokenStatus: WhatsAppTokenStatus;
  expiresAt: string | null;
  message: string;
} {
  const message = (input.message ?? "Authentication Error").trim() || "Authentication Error";
  const code = input.code ?? null;
  const subcode = input.subcode ?? null;
  const isAuthFailure = code === 190 || /authenticat|oauth|access token|session has expired/i.test(message);

  if (!isAuthFailure) {
    return { isAuthFailure: false, tokenStatus: "unknown", expiresAt: null, message };
  }

  const expired =
    subcode === 463 ||
    /session has expired|token.*(expired|expire)|expired/i.test(message);

  return {
    isAuthFailure: true,
    tokenStatus: expired ? "expired" : "invalid",
    expiresAt: expired ? parseMetaExpiryFromMessage(message) : null,
    message,
  };
}

export function parseMetaExpiryFromMessage(message: string): string | null {
  const match = message.match(EXPIRED_SESSION_RE);
  if (!match?.[1]) return null;
  const parsed = Date.parse(match[1]);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

export function isWhatsAppTokenBlocked(
  health: WhatsAppCredentialHealth | null | undefined,
  now: Date = new Date(),
): { blocked: boolean; reason: string | null; tokenStatus: WhatsAppTokenStatus } {
  if (!health) {
    return { blocked: false, reason: null, tokenStatus: "unknown" };
  }

  if (health.tokenStatus === "missing") {
    return {
      blocked: true,
      reason: "WhatsApp access token is missing. Update Settings → WhatsApp credentials.",
      tokenStatus: "missing",
    };
  }

  if (health.tokenStatus === "expired") {
    return {
      blocked: true,
      reason: formatExpiredBlockReason(health),
      tokenStatus: "expired",
    };
  }

  if (health.tokenStatus === "invalid") {
    return {
      blocked: true,
      reason:
        health.lastAuthError?.trim() ||
        "WhatsApp access token is invalid. Update Settings → WhatsApp credentials.",
      tokenStatus: "invalid",
    };
  }

  if (health.tokenExpiresAt) {
    const expiresAt = Date.parse(health.tokenExpiresAt);
    if (!Number.isNaN(expiresAt) && expiresAt <= now.getTime()) {
      return {
        blocked: true,
        reason: formatExpiredBlockReason({
          ...health,
          tokenStatus: "expired",
        }),
        tokenStatus: "expired",
      };
    }
  }

  return { blocked: false, reason: null, tokenStatus: health.tokenStatus };
}

function formatExpiredBlockReason(health: WhatsAppCredentialHealth): string {
  const when = health.tokenExpiresAt
    ? ` Token expired at ${health.tokenExpiresAt}.`
    : "";
  const last = health.lastAuthError?.trim() ? ` Last Meta error: ${health.lastAuthError.trim()}` : "";
  return `WhatsApp access token is expired.${when}${last} Update Settings → WhatsApp credentials and run Test Connection.`.trim();
}

export function mapCredentialHealthRow(row: Record<string, unknown> | null): WhatsAppCredentialHealth | null {
  if (!row) return null;
  return {
    tokenStatus: (String(row.token_status ?? "unknown") as WhatsAppTokenStatus) || "unknown",
    tokenExpiresAt: row.token_expires_at ? String(row.token_expires_at) : null,
    tokenCheckedAt: row.token_checked_at ? String(row.token_checked_at) : null,
    lastSuccessfulSendAt: row.last_successful_send_at ? String(row.last_successful_send_at) : null,
    lastAuthError: row.last_auth_error ? String(row.last_auth_error) : null,
    lastAuthErrorAt: row.last_auth_error_at ? String(row.last_auth_error_at) : null,
    lastAuthErrorCode:
      row.last_auth_error_code == null || row.last_auth_error_code === ""
        ? null
        : Number(row.last_auth_error_code),
  };
}

export function createSupabaseWhatsAppCredentialLifecycle(
  client: SupabaseClient,
): WhatsAppCredentialLifecyclePort {
  return {
    async loadHealth(companyId) {
      const { data, error } = await client
        .from("company_whatsapp_settings")
        .select(
          "token_status, token_expires_at, token_checked_at, last_successful_send_at, last_auth_error, last_auth_error_at, last_auth_error_code",
        )
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return mapCredentialHealthRow((data as Record<string, unknown> | null) ?? null);
    },

    async recordHealth(companyId, patch) {
      const { error } = await client.rpc("record_company_whatsapp_credential_health", {
        p_company_id: companyId,
        p_token_status: patch.tokenStatus ?? null,
        p_token_expires_at: patch.tokenExpiresAt ?? null,
        p_clear_token_expires_at: Boolean(patch.clearTokenExpiresAt),
        p_token_checked_at: patch.tokenCheckedAt ?? null,
        p_last_successful_send_at: patch.lastSuccessfulSendAt ?? null,
        p_last_auth_error: patch.lastAuthError ?? null,
        p_clear_last_auth_error: Boolean(patch.clearLastAuthError),
        p_last_auth_error_at: patch.lastAuthErrorAt ?? null,
        p_last_auth_error_code: patch.lastAuthErrorCode ?? null,
        p_clear_last_auth_error_code: Boolean(patch.clearLastAuthErrorCode),
      });
      if (error) throw error;
    },

    async notifyAdmins(companyId, detail) {
      const { data, error } = await client.rpc("notify_company_whatsapp_credential_admins", {
        p_company_id: companyId,
        p_title: detail.title,
        p_message: detail.message,
        p_min_interval_seconds: detail.minIntervalSeconds ?? 3600,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
  };
}

function readMetaError(body: MetaErrorBody): {
  message: string;
  code?: number;
  subcode?: number;
} {
  return {
    message: body.error?.error_user_msg ?? body.error?.message ?? "Meta API request failed",
    code: body.error?.code,
    subcode: body.error?.error_subcode,
  };
}

export async function performWhatsAppConnectionTest(input: {
  runtimeConfig: WhatsAppChannelConfiguration;
  appSecret?: string | null;
  fetchFn?: typeof fetch;
}): Promise<WhatsAppConnectionTestReport> {
  const fetchFn = input.fetchFn ?? globalThis.fetch.bind(globalThis);
  const started = Date.now();
  const config = input.runtimeConfig;
  const apiVersion = config.apiVersion ?? "v21.0";
  const base = whatsAppGraphBaseUrl(apiVersion);
  const configuredPhoneNumberId = config.phoneNumberId?.trim() || "";
  const configuredWabaId = config.businessAccountId?.trim() || null;

  console.log("[WHATSAPP_CONNECTION_TEST] runtime configuration", {
    accessTokenMasked: maskAccessToken(config.accessToken),
    phoneNumberId: configuredPhoneNumberId || null,
    businessAccountId: configuredWabaId,
    apiVersion,
  });

  const report: WhatsAppConnectionTestReport = {
    ok: false,
    latencyMs: 0,
    tokenStatus: config.accessToken?.trim() ? "unknown" : "missing",
    tokenExpiresAt: null,
    accessToken: { ok: false },
    phoneNumber: { ok: false },
    businessAccount: { ok: false },
  };

  if (!config.accessToken?.trim()) {
    report.error = "WhatsApp access token is missing.";
    report.tokenStatus = "missing";
    report.latencyMs = Date.now() - started;
    return report;
  }

  if (!configuredPhoneNumberId) {
    report.error = "Phone Number ID is missing.";
    report.tokenStatus = "invalid";
    report.latencyMs = Date.now() - started;
    return report;
  }

  try {
    const meRes = await fetchFn(`${base}/me?fields=id,name`, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });
    const meBody = (await meRes.json()) as MetaErrorBody & { id?: string; name?: string };
    if (!meRes.ok) {
      const err = readMetaError(meBody);
      const classified = classifyMetaAuthFailure({
        message: err.message,
        code: err.code,
        subcode: err.subcode,
      });
      report.accessToken = { ok: false, error: err.message };
      report.error = err.message;
      report.metaErrorCode = err.code;
      report.metaErrorSubcode = err.subcode;
      report.tokenStatus = classified.tokenStatus;
      report.tokenExpiresAt = classified.expiresAt;
    } else {
      report.accessToken = {
        ok: true,
        ownerId: meBody.id,
        ownerName: meBody.name,
      };
      report.tokenStatus = "valid";
    }
  } catch (error) {
    report.accessToken = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    report.error = report.accessToken.error;
    report.tokenStatus = "invalid";
  }

  let actualWabaIdFromMeta: string | null = null;

  try {
    // GET /{PHONE_NUMBER_ID} — Graph v21+ phone resources do not expose whatsapp_business_account.
    // Ownership is validated via GET /{WABA_ID}/phone_numbers below.
    const phoneUrl =
      `${base}/${encodeURIComponent(configuredPhoneNumberId)}` +
      `?fields=id,display_phone_number,verified_name,status`;
    console.log("[WHATSAPP_CONNECTION_TEST] Meta GET /{PHONE_NUMBER_ID}", {
      path: `/${configuredPhoneNumberId}`,
      fields: "id,display_phone_number,verified_name,status",
      url: phoneUrl,
    });

    const phoneRes = await fetchFn(phoneUrl, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });
    const phoneBody = (await phoneRes.json()) as MetaErrorBody & {
      id?: string;
      display_phone_number?: string;
      verified_name?: string;
      metadata?: { parent?: { id?: string; type?: string } };
      [key: string]: unknown;
    };

    console.log("[WHATSAPP_CONNECTION_TEST] Meta GET /{PHONE_NUMBER_ID} response", {
      httpStatus: phoneRes.status,
      ok: phoneRes.ok,
      phoneId: phoneBody.id ?? null,
      displayPhoneNumber: phoneBody.display_phone_number ?? null,
      owningWabaId: extractOwningWabaIdFromPhoneBody(phoneBody as Record<string, unknown>),
      metaErrorCode: phoneBody.error?.code ?? null,
      metaErrorMessage: phoneBody.error?.error_user_msg ?? phoneBody.error?.message ?? null,
    });

    if (!phoneRes.ok) {
      const err = readMetaError(phoneBody);
      report.phoneNumber = { ok: false, error: err.message, owningWabaId: null };
      if (!report.error) {
        report.error = err.message;
        report.metaErrorCode = err.code;
        report.metaErrorSubcode = err.subcode;
      }
      const classified = classifyMetaAuthFailure({
        message: err.message,
        code: err.code,
        subcode: err.subcode,
      });
      if (classified.isAuthFailure) {
        report.tokenStatus = classified.tokenStatus;
        report.tokenExpiresAt = classified.expiresAt ?? report.tokenExpiresAt;
        report.mismatch = {
          configuredPhoneNumberId,
          configuredWabaId,
          actualWabaIdFromMeta: null,
          incorrectValue: "access_token",
          detail:
            "Access Token cannot access GET /{PHONE_NUMBER_ID}. Token lacks permission or Phone Number ID is wrong.",
        };
      } else {
        report.mismatch = {
          configuredPhoneNumberId,
          configuredWabaId,
          actualWabaIdFromMeta: null,
          incorrectValue: "phone_number_id",
          detail: `Meta rejected GET /{PHONE_NUMBER_ID}: ${err.message}`,
        };
      }
    } else {
      actualWabaIdFromMeta = extractOwningWabaIdFromPhoneBody(phoneBody as Record<string, unknown>);
      report.phoneNumber = {
        ok: phoneBody.id === configuredPhoneNumberId,
        id: phoneBody.id,
        displayPhoneNumber: phoneBody.display_phone_number,
        verifiedName: phoneBody.verified_name,
        owningWabaId: actualWabaIdFromMeta,
        error: phoneBody.id === configuredPhoneNumberId ? undefined : "Phone Number ID mismatch",
      };
      if (!report.phoneNumber.ok && !report.error) {
        report.error = report.phoneNumber.error;
      }
    }
  } catch (error) {
    report.phoneNumber = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      owningWabaId: null,
    };
    if (!report.error) report.error = report.phoneNumber.error;
  }

  if (!configuredWabaId) {
    report.businessAccount = {
      ok: false,
      error: "Business Account ID (WABA) is required.",
    };
    if (!report.error) report.error = report.businessAccount.error;
  } else {
    try {
      console.log("[WHATSAPP_CONNECTION_TEST] Meta GET /{WABA_ID}", {
        path: `/${configuredWabaId}`,
        configuredWabaId,
      });
      const wabaRes = await fetchFn(`${base}/${encodeURIComponent(configuredWabaId)}?fields=id,name`, {
        headers: { Authorization: `Bearer ${config.accessToken}` },
      });
      const wabaBody = (await wabaRes.json()) as MetaErrorBody & { id?: string; name?: string };
      console.log("[WHATSAPP_CONNECTION_TEST] Meta GET /{WABA_ID} response", {
        httpStatus: wabaRes.status,
        ok: wabaRes.ok,
        wabaId: wabaBody.id ?? null,
        wabaName: wabaBody.name ?? null,
        metaErrorCode: wabaBody.error?.code ?? null,
        metaErrorMessage: wabaBody.error?.error_user_msg ?? wabaBody.error?.message ?? null,
      });

      if (!wabaRes.ok) {
        const err = readMetaError(wabaBody);
        report.businessAccount = { ok: false, error: err.message, id: configuredWabaId };
        if (!report.error) {
          report.error = err.message;
          report.metaErrorCode = err.code;
          report.metaErrorSubcode = err.subcode;
        }
        const classified = classifyMetaAuthFailure({
          message: err.message,
          code: err.code,
          subcode: err.subcode,
        });
        if (classified.isAuthFailure) {
          report.tokenStatus = classified.tokenStatus;
          report.tokenExpiresAt = classified.expiresAt ?? report.tokenExpiresAt;
          report.mismatch = {
            configuredPhoneNumberId,
            configuredWabaId,
            actualWabaIdFromMeta,
            incorrectValue: "access_token",
            detail:
              "Access Token cannot access the configured WABA. Token lacks permission for this Business Account ID.",
          };
        } else {
          report.mismatch = {
            configuredPhoneNumberId,
            configuredWabaId,
            actualWabaIdFromMeta,
            incorrectValue: "waba_id",
            detail: `Meta rejected GET /{WABA_ID}: ${err.message}`,
          };
        }
      } else {
        report.businessAccount = {
          ok: wabaBody.id === configuredWabaId,
          id: wabaBody.id,
          name: wabaBody.name,
        };

        const phonesRes = await fetchFn(
          `${base}/${encodeURIComponent(configuredWabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,status&limit=100`,
          { headers: { Authorization: `Bearer ${config.accessToken}` } },
        );
        const phonesBody = (await phonesRes.json()) as MetaErrorBody & {
          data?: Array<{ id?: string }>;
        };
        const ids = (phonesBody.data ?? []).map((row) => String(row.id ?? "")).filter(Boolean);
        console.log("[WHATSAPP_CONNECTION_TEST] Meta GET /{WABA_ID}/phone_numbers", {
          httpStatus: phonesRes.status,
          ok: phonesRes.ok,
          configuredWabaId,
          configuredPhoneNumberId,
          wabaPhoneNumberIds: ids,
          phoneBelongsToConfiguredWaba: ids.includes(configuredPhoneNumberId),
          actualWabaIdFromMeta,
        });

        if (!phonesRes.ok) {
          const err = readMetaError(phonesBody);
          report.businessAccount.ok = false;
          report.businessAccount.error = err.message;
          report.businessAccount.phoneNumberBelongsToWaba = false;
          if (!report.error) report.error = err.message;
        } else {
          const belongs = ids.includes(configuredPhoneNumberId);
          report.businessAccount.phoneNumberBelongsToWaba = belongs;
          if (!belongs) {
            let incorrectValue: WhatsAppConnectionMismatch["incorrectValue"] = "unknown";
            if (
              actualWabaIdFromMeta &&
              configuredWabaId &&
              actualWabaIdFromMeta !== configuredWabaId
            ) {
              // Phone is reachable and Meta says it belongs to a different WABA.
              incorrectValue = "waba_id";
            } else if (actualWabaIdFromMeta && actualWabaIdFromMeta === configuredWabaId) {
              incorrectValue = "phone_number_id";
            } else if (report.phoneNumber.ok) {
              incorrectValue = "unknown";
            } else {
              incorrectValue = "phone_number_id";
            }

            const detail = formatPhoneWabaMismatchError({
              configuredPhoneNumberId,
              configuredWabaId,
              actualWabaIdFromMeta,
              incorrectValue,
            });

            report.businessAccount.ok = false;
            report.businessAccount.error = detail;
            report.mismatch = {
              configuredPhoneNumberId,
              configuredWabaId,
              actualWabaIdFromMeta,
              incorrectValue,
              wabaPhoneNumberIds: ids,
              detail,
            };
            if (!report.error) report.error = detail;

            console.error("[WHATSAPP_CONNECTION_TEST] Phone Number ID / WABA mismatch", report.mismatch);
          }
        }
      }
    } catch (error) {
      report.businessAccount = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        id: configuredWabaId,
      };
      if (!report.error) report.error = report.businessAccount.error;
    }
  }

  const appSecret = input.appSecret?.trim() || "";
  if (appSecret && report.accessToken.ok) {
    try {
      // Prefer app access token when we can discover app_id from /me/app or env is unavailable.
      // Using input token as access_token often fails; skip if no app_id known.
      const debugRes = await fetchFn(
        `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(config.accessToken)}&access_token=${encodeURIComponent(config.accessToken)}`,
      );
      const debugBody = (await debugRes.json()) as MetaErrorBody & {
        data?: {
          is_valid?: boolean;
          expires_at?: number;
          type?: string;
          app_id?: string;
        };
      };
      if (debugBody.data && typeof debugBody.data.is_valid === "boolean") {
        const expiresAt =
          typeof debugBody.data.expires_at === "number" && debugBody.data.expires_at > 0
            ? new Date(debugBody.data.expires_at * 1000).toISOString()
            : null;
        report.debugToken = {
          ok: debugBody.data.is_valid,
          isValid: debugBody.data.is_valid,
          expiresAt,
          type: debugBody.data.type ?? null,
        };
        if (expiresAt) report.tokenExpiresAt = expiresAt;
        if (!debugBody.data.is_valid) {
          report.tokenStatus = "invalid";
          report.debugToken.error = "Token marked invalid by debug_token.";
          if (!report.error) report.error = report.debugToken.error;
        }
      } else if (debugBody.error) {
        const classified = classifyMetaAuthFailure({
          message: debugBody.error.message,
          code: debugBody.error.code,
          subcode: debugBody.error.error_subcode,
        });
        report.debugToken = {
          ok: false,
          error: debugBody.error.message,
          isValid: false,
        };
        if (classified.isAuthFailure) {
          report.tokenStatus = classified.tokenStatus;
          report.tokenExpiresAt = classified.expiresAt ?? report.tokenExpiresAt;
          if (!report.error) report.error = classified.message;
        }
      }
    } catch (error) {
      report.debugToken = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  report.ok =
    report.accessToken.ok &&
    report.phoneNumber.ok &&
    report.businessAccount.ok &&
    report.tokenStatus === "valid";

  if (report.ok) {
    report.error = undefined;
  }

  report.latencyMs = Date.now() - started;
  return report;
}

export async function assertWhatsAppCredentialsSendable(input: {
  companyId: string;
  lifecycle: WhatsAppCredentialLifecyclePort;
  now?: Date;
}): Promise<WhatsAppCredentialHealth | null> {
  const health = await input.lifecycle.loadHealth(input.companyId);
  const gate = isWhatsAppTokenBlocked(health, input.now ?? new Date());

  if (!gate.blocked) {
    return health;
  }

  if (gate.tokenStatus === "expired" && health?.tokenStatus !== "expired") {
    await input.lifecycle.recordHealth(input.companyId, {
      tokenStatus: "expired",
      tokenCheckedAt: new Date().toISOString(),
      lastAuthError: gate.reason,
      lastAuthErrorAt: new Date().toISOString(),
      lastAuthErrorCode: 190,
    });
  }

  await input.lifecycle.notifyAdmins(input.companyId, {
    title: "WhatsApp credentials require attention",
    message: gate.reason ?? "WhatsApp access token cannot be used for outbound send.",
  });

  throw new ValidationError(
    gate.reason ?? "WhatsApp access token cannot be used for outbound send.",
  );
}

export async function recordWhatsAppOutboundAuthFailure(input: {
  companyId: string;
  lifecycle: WhatsAppCredentialLifecyclePort;
  message: string;
  code?: number | null;
  subcode?: number | null;
}): Promise<void> {
  const classified = classifyMetaAuthFailure({
    message: input.message,
    code: input.code,
    subcode: input.subcode,
  });
  if (!classified.isAuthFailure) return;

  const now = new Date().toISOString();
  await input.lifecycle.recordHealth(input.companyId, {
    tokenStatus: classified.tokenStatus,
    tokenExpiresAt: classified.expiresAt,
    clearTokenExpiresAt: !classified.expiresAt && classified.tokenStatus !== "expired",
    tokenCheckedAt: now,
    lastAuthError: classified.message,
    lastAuthErrorAt: now,
    lastAuthErrorCode: input.code ?? 190,
  });

  await input.lifecycle.notifyAdmins(input.companyId, {
    title: "WhatsApp authentication failed",
    message: classified.message,
  });
}

export async function recordWhatsAppOutboundSendSuccess(input: {
  companyId: string;
  lifecycle: WhatsAppCredentialLifecyclePort;
}): Promise<void> {
  const now = new Date().toISOString();
  await input.lifecycle.recordHealth(input.companyId, {
    tokenStatus: "valid",
    tokenCheckedAt: now,
    lastSuccessfulSendAt: now,
    clearLastAuthError: true,
    clearLastAuthErrorCode: true,
  });
}

export async function persistConnectionTestResult(input: {
  companyId: string;
  lifecycle: WhatsAppCredentialLifecyclePort;
  report: WhatsAppConnectionTestReport;
}): Promise<void> {
  const now = new Date().toISOString();
  if (input.report.ok) {
    await input.lifecycle.recordHealth(input.companyId, {
      tokenStatus: "valid",
      tokenExpiresAt: input.report.tokenExpiresAt,
      clearTokenExpiresAt: !input.report.tokenExpiresAt,
      tokenCheckedAt: now,
      clearLastAuthError: true,
      clearLastAuthErrorCode: true,
    });
    return;
  }

  await input.lifecycle.recordHealth(input.companyId, {
    tokenStatus: input.report.tokenStatus,
    tokenExpiresAt: input.report.tokenExpiresAt,
    clearTokenExpiresAt: !input.report.tokenExpiresAt,
    tokenCheckedAt: now,
    lastAuthError: input.report.error ?? "WhatsApp connection test failed",
    lastAuthErrorAt: now,
    lastAuthErrorCode: input.report.metaErrorCode ?? null,
    clearLastAuthErrorCode: input.report.metaErrorCode == null,
  });

  if (
    input.report.tokenStatus === "expired" ||
    input.report.tokenStatus === "invalid" ||
    input.report.tokenStatus === "missing"
  ) {
    await input.lifecycle.notifyAdmins(input.companyId, {
      title: "WhatsApp connection test failed",
      message: input.report.error ?? "WhatsApp connection test failed",
    });
  }
}
