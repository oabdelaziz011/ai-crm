import type { MetaWhatsAppConfig } from "@/lib/notifications/providers/whatsapp/types/whatsapp-types";

const DEFAULT_API_VERSION = "v21.0";

export type WhatsAppHealthCheckDetail = {
  ok: boolean;
  error?: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  businessAccountName?: string;
};

export type WhatsAppDetailedHealthResult = {
  ok: boolean;
  provider: string;
  latencyMs: number;
  enabled: boolean;
  error?: string;
  checks: {
    accessToken: WhatsAppHealthCheckDetail;
    phoneNumberId: WhatsAppHealthCheckDetail;
    businessAccountId: WhatsAppHealthCheckDetail;
  };
};

function graphBaseUrl(apiVersion = DEFAULT_API_VERSION): string {
  return `https://graph.facebook.com/${apiVersion}`;
}

function readMetaError(body: { error?: { message?: string; error_user_msg?: string } }): string {
  return body.error?.error_user_msg ?? body.error?.message ?? "Meta API request failed";
}

export async function performWhatsAppDetailedHealthCheck(
  config: MetaWhatsAppConfig,
  options: { enabled?: boolean; fetchFn?: typeof fetch } = {},
): Promise<WhatsAppDetailedHealthResult> {
  const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  const started = Date.now();
  const apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
  const enabled = options.enabled ?? true;

  const checks: WhatsAppDetailedHealthResult["checks"] = {
    accessToken: { ok: false },
    phoneNumberId: { ok: false },
    businessAccountId: { ok: false },
  };

  if (!enabled) {
    return {
      ok: false,
      provider: "meta_cloud",
      latencyMs: Date.now() - started,
      enabled: false,
      error: "WhatsApp provider is disabled",
      checks,
    };
  }

  if (!config.accessToken.trim()) {
    return {
      ok: false,
      provider: "meta_cloud",
      latencyMs: Date.now() - started,
      enabled: true,
      error: "Access Token is missing",
      checks: {
        ...checks,
        accessToken: { ok: false, error: "Access Token is missing" },
      },
    };
  }

  if (!config.phoneNumberId.trim()) {
    return {
      ok: false,
      provider: "meta_cloud",
      latencyMs: Date.now() - started,
      enabled: true,
      error: "Phone Number ID is missing",
      checks: {
        accessToken: { ok: true },
        phoneNumberId: { ok: false, error: "Phone Number ID is missing" },
        businessAccountId: { ok: false, error: "Business Account ID not checked" },
      },
    };
  }

  try {
    const phoneResponse = await fetchFn(
      `${graphBaseUrl(apiVersion)}/${encodeURIComponent(config.phoneNumberId)}?fields=id,display_phone_number,verified_name,status`,
      { headers: { Authorization: `Bearer ${config.accessToken}` } },
    );
    const phoneBody = (await phoneResponse.json()) as {
      id?: string;
      display_phone_number?: string;
      verified_name?: string;
      status?: string;
      error?: { message?: string; error_user_msg?: string };
    };

    if (!phoneResponse.ok) {
      const error = readMetaError(phoneBody);
      checks.accessToken = { ok: false, error };
      checks.phoneNumberId = { ok: false, error };
    } else {
      checks.accessToken = { ok: true };
      checks.phoneNumberId = {
        ok: phoneBody.id === config.phoneNumberId,
        displayPhoneNumber: phoneBody.display_phone_number,
        verifiedName: phoneBody.verified_name,
        error: phoneBody.id === config.phoneNumberId ? undefined : "Phone Number ID mismatch",
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.accessToken = { ok: false, error: message };
    checks.phoneNumberId = { ok: false, error: message };
  }

  if (config.businessAccountId.trim()) {
    try {
      const wabaResponse = await fetchFn(
        `${graphBaseUrl(apiVersion)}/${encodeURIComponent(config.businessAccountId)}?fields=id,name`,
        { headers: { Authorization: `Bearer ${config.accessToken}` } },
      );
      const wabaBody = (await wabaResponse.json()) as {
        id?: string;
        name?: string;
        error?: { message?: string; error_user_msg?: string };
      };

      if (!wabaResponse.ok) {
        checks.businessAccountId = { ok: false, error: readMetaError(wabaBody) };
      } else {
        checks.businessAccountId = {
          ok: wabaBody.id === config.businessAccountId,
          businessAccountName: wabaBody.name,
          error: wabaBody.id === config.businessAccountId ? undefined : "Business Account ID mismatch",
        };
      }
    } catch (error) {
      checks.businessAccountId = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } else {
    checks.businessAccountId = { ok: true, error: undefined };
  }

  const ok =
    checks.accessToken.ok &&
    checks.phoneNumberId.ok &&
    checks.businessAccountId.ok;

  const firstError =
    checks.accessToken.error ??
    checks.phoneNumberId.error ??
    checks.businessAccountId.error;

  return {
    ok,
    provider: "meta_cloud",
    latencyMs: Date.now() - started,
    enabled: true,
    error: ok ? undefined : firstError,
    checks,
  };
}
