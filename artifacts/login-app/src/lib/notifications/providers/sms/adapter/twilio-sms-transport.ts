/**
 * Node-only Twilio SMS transport for notification_queue processing.
 * Import only from api-server / worker contexts — never from browser bundles.
 */

import type {
  SmsVendorRuntimeConfig,
  SmsVendorSendInput,
  SmsVendorSendResult,
  SmsVendorTransport,
} from "./sms-vendor-transport";

export type TwilioSmsTransportConfig = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  statusCallback?: string | null;
};

export type TwilioSmsTransportSendInput = {
  to: string;
  body: string;
};

export type TwilioSmsTransportSendResult = {
  messageId: string;
  status: string | null;
};

export class TwilioSmsTransport implements SmsVendorTransport {
  readonly provider = "twilio" as const;

  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async send(
    message: SmsVendorSendInput | TwilioSmsTransportSendInput,
    config: SmsVendorRuntimeConfig | TwilioSmsTransportConfig,
  ): Promise<SmsVendorSendResult> {
    const accountSid = String(
      "accountSid" in config ? config.accountSid : (config as SmsVendorRuntimeConfig).accountSid ?? "",
    ).trim();
    const authToken = String(
      "authToken" in config ? config.authToken : (config as SmsVendorRuntimeConfig).authToken ?? "",
    ).trim();
    const fromNumber = String(config.fromNumber ?? "").trim();
    const statusCallback =
      "statusCallback" in config && config.statusCallback ? String(config.statusCallback).trim() : "";
    const to = message.to.trim();
    const body = message.body.trim();

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error("Twilio SMS credentials are incomplete.");
    }
    if (!to) {
      throw new Error("SMS recipient phone is required.");
    }
    if (!body) {
      throw new Error("SMS body is empty.");
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
    const form = new URLSearchParams();
    form.set("To", to);
    form.set("From", fromNumber);
    form.set("Body", body);
    if (statusCallback) {
      form.set("StatusCallback", statusCallback);
    }

    const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form.toString(),
    });

    let json: { sid?: string; status?: string; message?: string; code?: number } = {};
    try {
      json = (await response.json()) as typeof json;
    } catch {
      // ignore parse errors; fall through to HTTP status
    }

    if (!response.ok) {
      const detail =
        json.message ||
        (typeof json.code === "number" ? `Twilio error ${json.code}` : null) ||
        `Twilio HTTP ${response.status}`;
      throw new Error(String(detail));
    }

    const messageId = String(json.sid ?? "").trim();
    if (!messageId) {
      throw new Error("Twilio did not return a Message SID.");
    }

    return {
      messageId,
      status: typeof json.status === "string" ? json.status : null,
    };
  }
}
