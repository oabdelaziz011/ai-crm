import type { TwilioSmsApiMessageResponse, TwilioSmsCredentials, TwilioSmsSendPayload } from "./twilio-sms-types.js";
import { ValidationError } from "../../errors.js";

export type TwilioSmsApiClientOptions = {
  fetchFn?: typeof fetch;
  onOutboundRequest?: (detail: Record<string, unknown>) => void;
};

export class TwilioSmsApiClient {
  private readonly fetchFn: typeof fetch;
  private readonly onOutboundRequest?: (detail: Record<string, unknown>) => void;

  constructor(options: TwilioSmsApiClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.onOutboundRequest = options.onOutboundRequest;
  }

  async sendMessage(
    credentials: TwilioSmsCredentials,
    payload: TwilioSmsSendPayload,
  ): Promise<TwilioSmsApiMessageResponse> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(credentials.accountSid)}/Messages.json`;
    const body = new URLSearchParams();
    body.set("To", payload.To);
    body.set("From", payload.From);
    body.set("Body", payload.Body);
    if (payload.StatusCallback) {
      body.set("StatusCallback", payload.StatusCallback);
    }

    const basic = Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString("base64");

    this.onOutboundRequest?.({
      stage: "twilio.messages.create",
      accountSid: credentials.accountSid,
      to: payload.To,
      from: payload.From,
      // Never log auth token or full body content in diagnostics.
      bodyLength: payload.Body.length,
    });

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });

    let json: TwilioSmsApiMessageResponse & { message?: string; code?: number } = {};
    try {
      json = (await response.json()) as typeof json;
    } catch {
      // ignore
    }

    if (!response.ok) {
      const detail =
        json.message ||
        json.error_message ||
        (typeof json.code === "number" ? `Twilio error ${json.code}` : null) ||
        `Twilio HTTP ${response.status}`;
      throw new ValidationError(String(detail));
    }

    if (!json.sid) {
      throw new ValidationError("Twilio did not return a Message SID.");
    }

    return json;
  }
}
