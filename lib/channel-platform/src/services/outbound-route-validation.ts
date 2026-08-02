export type OutboundRouteIssueCode =
  | "missing_session"
  | "missing_company_channel"
  | "missing_external_thread"
  | "missing_channel_key";

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
