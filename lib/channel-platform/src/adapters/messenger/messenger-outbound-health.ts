import { messengerGraphBaseUrl } from "./messenger-config.js";
import type { MessengerChannelConfiguration } from "./messenger-config.js";

export type MessengerHealthCheckDetail = {
  ok: boolean;
  error?: string;
  metaErrorCode?: number;
  name?: string;
};

export type MessengerOutboundHealthReport = {
  ok: boolean;
  latencyMs: number;
  error?: string;
  metaErrorCode?: number;
  credentialSource: "company_messenger_settings";
  endpoint: string;
  graphApiVersion: string;
  pageId: string;
  accessToken: {
    valid: boolean;
    ownerId?: string;
    ownerName?: string;
    prefix: string;
    source: "company_messenger_settings";
  };
  page: MessengerHealthCheckDetail;
  sendProbe: MessengerHealthCheckDetail;
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

export type MessengerOutboundHealthInput = {
  companyId: string;
  runtimeConfig: MessengerChannelConfiguration;
  fetchFn?: typeof fetch;
};

export async function performMessengerOutboundHealthCheck(
  input: MessengerOutboundHealthInput,
): Promise<MessengerOutboundHealthReport> {
  const fetchFn = input.fetchFn ?? globalThis.fetch.bind(globalThis);
  const started = Date.now();
  const config = input.runtimeConfig;
  const apiVersion = config.apiVersion ?? "v21.0";
  const endpoint = `${messengerGraphBaseUrl(apiVersion)}/${encodeURIComponent(config.pageId)}/messages`;

  const report: MessengerOutboundHealthReport = {
    ok: false,
    latencyMs: 0,
    credentialSource: "company_messenger_settings",
    endpoint,
    graphApiVersion: apiVersion,
    pageId: config.pageId,
    accessToken: {
      valid: false,
      prefix: config.accessToken.slice(0, 8) + "...",
      source: "company_messenger_settings",
    },
    page: { ok: false },
    sendProbe: { ok: false },
  };

  try {
    const meRes = await fetchFn(`${messengerGraphBaseUrl(apiVersion)}/me?fields=id,name`, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });
    const meBody = (await meRes.json()) as { id?: string; name?: string; error?: { message?: string; code?: number } };
    if (!meRes.ok) {
      const err = readMetaError(meBody);
      report.error = err.message;
      report.metaErrorCode = err.code;
    } else {
      report.accessToken.valid = true;
      report.accessToken.ownerId = meBody.id;
      report.accessToken.ownerName = meBody.name;
    }
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  }

  try {
    const pageRes = await fetchFn(
      `${messengerGraphBaseUrl(apiVersion)}/${encodeURIComponent(config.pageId)}?fields=id,name`,
      { headers: { Authorization: `Bearer ${config.accessToken}` } },
    );
    const pageBody = (await pageRes.json()) as {
      id?: string;
      name?: string;
      error?: { message?: string; code?: number };
    };
    if (!pageRes.ok) {
      const err = readMetaError(pageBody);
      report.page = { ok: false, error: err.message, metaErrorCode: err.code };
    } else {
      report.page = {
        ok: pageBody.id === config.pageId,
        name: pageBody.name,
        error: pageBody.id === config.pageId ? undefined : "Messenger Page ID mismatch",
      };
    }
  } catch (error) {
    report.page = {
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
      body: JSON.stringify({
        messaging_type: "RESPONSE",
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

  report.ok = report.accessToken.valid && report.page.ok;
  report.latencyMs = Date.now() - started;

  if (!report.error && !report.ok) {
    report.error = report.page.error ?? report.sendProbe.error ?? "Messenger outbound health check failed";
    report.metaErrorCode = report.page.metaErrorCode ?? report.sendProbe.metaErrorCode;
  }

  return report;
}
