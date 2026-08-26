export type OutboundRouteIssueCode =
  | "missing_session"
  | "missing_company_channel"
  | "missing_external_thread"
  | "missing_channel_key"
  | "recipient_thread_mismatch";

export type OutboundRouteIssue = {
  code: OutboundRouteIssueCode;
  message: string;
};

export type ChannelSessionRow = {
  id: string;
  external_thread_id: string | null;
  channel_key: string | null;
  company_channel_id: string | null;
};

export type OutboundRouteTarget = {
  conversationId: string;
  companyChannelId: string | null;
  channelKey: string;
  externalThreadId: string | null;
};

/** Digits-only compare so 2010… and +2010… / 010… variants still match the session sender. */
export function normalizeOutboundRecipientDigits(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

/**
 * Outbound recipient MUST come from the channel session / inbound sender thread.
 * Never allow a CRM customer phone to silently replace the WhatsApp recipient.
 */
export function assertOutboundRecipientMatchesSession(input: {
  sessionExternalThreadId: string | null | undefined;
  requestExternalThreadId: string | null | undefined;
}): OutboundRouteIssue | null {
  const sessionDigits = normalizeOutboundRecipientDigits(input.sessionExternalThreadId);
  const requestDigits = normalizeOutboundRecipientDigits(input.requestExternalThreadId);
  if (!sessionDigits || !requestDigits) return null;
  if (sessionDigits === requestDigits) return null;
  // Egypt local 01… vs WA 201… — treat as same sender, not a mismatch.
  const sessionLocal =
    sessionDigits.startsWith("20") && sessionDigits.length >= 12
      ? `0${sessionDigits.slice(2)}`
      : sessionDigits;
  const requestLocal =
    requestDigits.startsWith("20") && requestDigits.length >= 12
      ? `0${requestDigits.slice(2)}`
      : requestDigits;
  if (sessionLocal === requestLocal) return null;
  return {
    code: "recipient_thread_mismatch",
    message:
      "Outbound WhatsApp recipient must match the current channel session sender — refusing CRM phone override.",
  };
}

export function validateOutboundRoute(
  session: ChannelSessionRow | null,
  target: OutboundRouteTarget,
):
  | {
      ok: true;
      route: {
        id: string;
        company_channel_id: string;
        external_thread_id: string;
        channel_key: string;
      };
    }
  | { ok: false; issue: OutboundRouteIssue } {
  const companyChannelId = session?.company_channel_id ?? target.companyChannelId;
  // Prefer session thread (inbound sender). Never let a mismatched CRM/target phone win.
  const mismatch = assertOutboundRecipientMatchesSession({
    sessionExternalThreadId: session?.external_thread_id,
    requestExternalThreadId: target.externalThreadId,
  });
  if (mismatch) {
    return { ok: false, issue: mismatch };
  }
  const externalThreadId = session?.external_thread_id ?? target.externalThreadId;
  const channelKey = session?.channel_key ?? target.channelKey;
  const sessionId = session?.id ?? null;

  if (!sessionId) {
    return {
      ok: false,
      issue: {
        code: "missing_session",
        message: "No active channel session is linked to this conversation.",
      },
    };
  }
  if (!companyChannelId) {
    return {
      ok: false,
      issue: {
        code: "missing_company_channel",
        message: "The channel connection for this conversation is not configured.",
      },
    };
  }
  if (!externalThreadId?.trim()) {
    return {
      ok: false,
      issue: {
        code: "missing_external_thread",
        message: "This conversation is missing outbound routing (external thread id).",
      },
    };
  }
  if (!channelKey?.trim()) {
    return {
      ok: false,
      issue: {
        code: "missing_channel_key",
        message: "The channel type for this conversation could not be resolved.",
      },
    };
  }

  return {
    ok: true,
    route: {
      id: sessionId,
      company_channel_id: companyChannelId,
      external_thread_id: externalThreadId,
      channel_key: channelKey,
    },
  };
}
