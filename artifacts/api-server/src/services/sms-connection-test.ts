/**
 * Honest SMS provider connection test.
 * Never returns ok from a stub — Twilio requires a live Account API auth check.
 */

export type SmsDecryptedSettings = {
  enabled: boolean;
  provider: string;
  accountSid: string;
  fromNumber: string;
  authToken: string;
};

export type SmsConnectionTestReport = {
  ok: boolean;
  latencyMs: number;
  error?: string;
  reason:
    | "ok"
    | "provider_missing"
    | "credentials_incomplete"
    | "settings_disabled"
    | "provider_auth_failed"
    | "provider_unreachable";
  provider: string;
  accountSid: string;
  fromNumber: string;
  accountName?: string;
};

export async function performSmsConnectionTest(
  settings: SmsDecryptedSettings | null,
  fetchImpl: typeof fetch = fetch,
): Promise<SmsConnectionTestReport> {
  const started = Date.now();
  const base = {
    provider: settings?.provider?.trim() ?? "",
    accountSid: settings?.accountSid?.trim() ?? "",
    fromNumber: settings?.fromNumber?.trim() ?? "",
  };

  if (!settings) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: "SMS provider configuration is missing.",
      reason: "provider_missing",
      ...base,
    };
  }

  if (!settings.enabled) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: "SMS channel is disabled.",
      reason: "settings_disabled",
      ...base,
    };
  }

  const provider = settings.provider.trim();
  if (!provider) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: "SMS provider is not configured.",
      reason: "provider_missing",
      ...base,
    };
  }

  if (provider !== "twilio") {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: `SMS provider "${provider}" is not supported for connection tests.`,
      reason: "provider_missing",
      ...base,
    };
  }

  const accountSid = settings.accountSid.trim();
  const authToken = settings.authToken.trim();
  const fromNumber = settings.fromNumber.trim();
  if (!accountSid || !authToken || !fromNumber) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: "SMS credentials are incomplete (account, auth token, and sender number required).",
      reason: "credentials_incomplete",
      ...base,
    };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`;
  const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: "application/json",
      },
    });

    const latencyMs = Date.now() - started;

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        latencyMs,
        error: "SMS provider authentication failed.",
        reason: "provider_auth_failed",
        ...base,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        latencyMs,
        error: `SMS provider returned HTTP ${response.status}.`,
        reason: "provider_unreachable",
        ...base,
      };
    }

    let accountName: string | undefined;
    try {
      const body = (await response.json()) as { friendly_name?: string };
      if (typeof body.friendly_name === "string" && body.friendly_name.trim()) {
        accountName = body.friendly_name.trim();
      }
    } catch {
      // Ignore body parse errors — auth already succeeded.
    }

    return {
      ok: true,
      latencyMs,
      reason: "ok",
      ...base,
      accountName,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : "SMS provider unreachable.",
      reason: "provider_unreachable",
      ...base,
    };
  }
}
