import { whatsAppGraphBaseUrl } from "./whatsapp-config.js";
import type { WhatsAppChannelConfiguration } from "./whatsapp-config.js";

export type WhatsAppHealthCheckDetail = {
  ok: boolean;
  error?: string;
  metaErrorCode?: number;
  displayPhoneNumber?: string;
  verifiedName?: string;
  businessAccountId?: string;
  businessAccountName?: string;
  phoneNumberIds?: string[];
};

export type WhatsAppOutboundHealthReport = {
  ok: boolean;
  latencyMs: number;
  error?: string;
  metaErrorCode?: number;
  credentialSource: "company_whatsapp_settings";
  usesEnvironmentVariables: false;
  endpoint: string;
  graphApiVersion: string;
  phoneNumberId: string;
  businessAccountId: string | null;
  accessToken: {
    valid: boolean;
    ownerId?: string;
    ownerName?: string;
    scopes?: string[];
    missingScopes?: string[];
    prefix: string;
    source: "company_whatsapp_settings";
  };
  phoneNumber: WhatsAppHealthCheckDetail;
  businessAccount: WhatsAppHealthCheckDetail;
  sendProbe: WhatsAppHealthCheckDetail;
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

export type WhatsAppOutboundHealthInput = {
  companyId: string;
  runtimeConfig: WhatsAppChannelConfiguration;
  webhookWabaId?: string | null;
  fetchFn?: typeof fetch;
};

export async function performWhatsAppOutboundHealthCheck(
  input: WhatsAppOutboundHealthInput,
): Promise<WhatsAppOutboundHealthReport> {
  const fetchFn = input.fetchFn ?? globalThis.fetch.bind(globalThis);
  const started = Date.now();
  const config = input.runtimeConfig;
  const apiVersion = config.apiVersion ?? "v21.0";
  const endpoint = `${whatsAppGraphBaseUrl(apiVersion)}/${config.phoneNumberId}/messages`;

  const report: WhatsAppOutboundHealthReport = {
    ok: false,
    latencyMs: 0,
    credentialSource: "company_whatsapp_settings",
    usesEnvironmentVariables: false,
    endpoint,
    graphApiVersion: apiVersion,
    phoneNumberId: config.phoneNumberId,
    businessAccountId: config.businessAccountId ?? null,
    accessToken: {
      valid: false,
      prefix: config.accessToken.slice(0, 8) + "...",
      source: "company_whatsapp_settings",
    },
    phoneNumber: { ok: false },
    businessAccount: { ok: false },
    sendProbe: { ok: false },
  };

  try {
    const meRes = await fetchFn(`${whatsAppGraphBaseUrl(apiVersion)}/me?fields=id,name`, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });
    const meBody = (await meRes.json()) as { id?: string; name?: string; error?: { message?: string; code?: number } };
    if (!meRes.ok) {
      const err = readMetaError(meBody);
      report.accessToken.valid = false;
      report.accessToken.ownerId = undefined;
      report.error = err.message;
      report.metaErrorCode = err.code;
    } else {
      report.accessToken.valid = true;
      report.accessToken.ownerId = meBody.id;
      report.accessToken.ownerName = meBody.name;
    }

    const permRes = await fetchFn(`${whatsAppGraphBaseUrl(apiVersion)}/me/permissions`, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });
    const permBody = (await permRes.json()) as {
      data?: Array<{ permission?: string; status?: string }>;
    };
    const granted = (permBody.data ?? [])
      .filter((entry) => entry.status === "granted")
      .map((entry) => entry.permission ?? "")
      .filter(Boolean);
    report.accessToken.scopes = granted;
    const required = ["whatsapp_business_messaging", "whatsapp_business_management"];
    report.accessToken.missingScopes = required.filter((scope) => !granted.includes(scope));
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  }

  try {
    const phoneRes = await fetchFn(
      `${whatsAppGraphBaseUrl(apiVersion)}/${encodeURIComponent(config.phoneNumberId)}?fields=id,display_phone_number,verified_name,status`,
      { headers: { Authorization: `Bearer ${config.accessToken}` } },
    );
    const phoneBody = (await phoneRes.json()) as {
      id?: string;
      display_phone_number?: string;
      verified_name?: string;
      error?: { message?: string; code?: number };
    };
    if (!phoneRes.ok) {
      const err = readMetaError(phoneBody);
      report.phoneNumber = { ok: false, error: err.message, metaErrorCode: err.code };
    } else {
      report.phoneNumber = {
        ok: phoneBody.id === config.phoneNumberId,
        displayPhoneNumber: phoneBody.display_phone_number,
        verifiedName: phoneBody.verified_name,
        error: phoneBody.id === config.phoneNumberId ? undefined : "Phone Number ID mismatch",
      };
    }
  } catch (error) {
    report.phoneNumber = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const wabaId = config.businessAccountId ?? input.webhookWabaId ?? null;

  if (wabaId) {
    try {
      const wabaRes = await fetchFn(
        `${whatsAppGraphBaseUrl(apiVersion)}/${encodeURIComponent(wabaId)}?fields=id,name`,
        { headers: { Authorization: `Bearer ${config.accessToken}` } },
      );
      const wabaBody = (await wabaRes.json()) as {
        id?: string;
        name?: string;
        error?: { message?: string; code?: number };
      };
      if (!wabaRes.ok) {
        const err = readMetaError(wabaBody);
        report.businessAccount = {
          ok: false,
          error: err.message,
          metaErrorCode: err.code,
          businessAccountId: wabaId,
        };
      } else {
        report.businessAccount = {
          ok: wabaBody.id === wabaId,
          businessAccountId: wabaBody.id,
          businessAccountName: wabaBody.name,
        };

        const phonesRes = await fetchFn(
          `${whatsAppGraphBaseUrl(apiVersion)}/${encodeURIComponent(wabaId)}/phone_numbers?fields=id`,
          { headers: { Authorization: `Bearer ${config.accessToken}` } },
        );
        const phonesBody = (await phonesRes.json()) as { data?: Array<{ id?: string }> };
        const phoneIds = (phonesBody.data ?? []).map((row) => row.id).filter(Boolean) as string[];
        report.businessAccount.phoneNumberIds = phoneIds;
        if (!phoneIds.includes(config.phoneNumberId)) {
          report.businessAccount.ok = false;
          report.businessAccount.error = "Configured Phone Number ID is not registered on this WABA";
        }
      }
    } catch (error) {
      report.businessAccount = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        businessAccountId: wabaId,
      };
    }
  } else {
    report.businessAccount = { ok: true, error: "Business Account ID not configured (optional)" };
  }

  try {
    const sendRes = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: "0000000000",
        type: "text",
        text: { body: "health-check-probe" },
      }),
    });
    const sendBody = (await sendRes.json()) as { error?: { message?: string; code?: number } };
    if (sendRes.status === 403) {
      const err = readMetaError(sendBody);
      report.sendProbe = { ok: false, error: err.message, metaErrorCode: err.code };
      report.error = err.message;
      report.metaErrorCode = err.code;
    } else {
      report.sendProbe = {
        ok: true,
        error: sendBody.error?.message,
        metaErrorCode: sendBody.error?.code,
      };
    }
  } catch (error) {
    report.sendProbe = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  report.ok =
    report.accessToken.valid &&
    report.phoneNumber.ok &&
    report.businessAccount.ok &&
    (report.accessToken.missingScopes?.length ?? 0) === 0 &&
    report.sendProbe.ok !== false;

  report.latencyMs = Date.now() - started;
  if (!report.error && !report.ok) {
    report.error =
      report.sendProbe.error ??
      report.phoneNumber.error ??
      report.businessAccount.error ??
      "WhatsApp outbound health check failed";
    report.metaErrorCode =
      report.sendProbe.metaErrorCode ??
      report.phoneNumber.metaErrorCode ??
      report.businessAccount.metaErrorCode;
  }

  return report;
}
