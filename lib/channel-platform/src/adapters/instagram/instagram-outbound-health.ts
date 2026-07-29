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

export type InstagramOutboundHealthInput = {
  companyId: string;
  runtimeConfig: InstagramChannelConfiguration;
  fetchFn?: typeof fetch;
};

export async function performInstagramOutboundHealthCheck(
  input: InstagramOutboundHealthInput,
): Promise<InstagramOutboundHealthReport> {
  const fetchFn = input.fetchFn ?? globalThis.fetch.bind(globalThis);
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

  try {
    const meRes = await fetchFn(`${instagramGraphBaseUrl(apiVersion)}/me?fields=id,name`, {
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
    const accountRes = await fetchFn(
      `${instagramGraphBaseUrl(apiVersion)}/${encodeURIComponent(config.instagramBusinessAccountId)}?fields=id,username,name`,
      { headers: { Authorization: `Bearer ${config.accessToken}` } },
    );
    const accountBody = (await accountRes.json()) as {
      id?: string;
      username?: string;
      name?: string;
      error?: { message?: string; code?: number };
    };
    if (!accountRes.ok) {
      const err = readMetaError(accountBody);
      report.instagramAccount = { ok: false, error: err.message, metaErrorCode: err.code };
    } else {
      report.instagramAccount = {
        ok: accountBody.id === config.instagramBusinessAccountId,
        username: accountBody.username,
        name: accountBody.name,
        error:
          accountBody.id === config.instagramBusinessAccountId
            ? undefined
            : "Instagram Business Account ID mismatch",
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
