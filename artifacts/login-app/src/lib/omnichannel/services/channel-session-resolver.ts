import { supabase } from "@/lib/supabase";
import { getFreshAccessToken } from "@/lib/auth/fresh-access-token";
import {
  isAuthenticatedApiConfigured,
  resolveAuthenticatedApiBase,
} from "@/lib/api-server/normalize-api-base";
import { buildEmailComposeSessionInsert } from "@/lib/email-workspace/email-compose-new";
import type { ChannelSessionRow } from "@/lib/omnichannel/services/outbound-delivery";

export { buildEmailComposeSessionInsert };

export async function resolveChannelSession(conversationId: string): Promise<ChannelSessionRow | null> {
  const { data } = await supabase
    .from("channel_sessions")
    .select("id, external_thread_id, channel_key, company_channel_id")
    .eq("conversation_id", conversationId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

type ComposeSessionApiBody = ChannelSessionRow & {
  error?: string;
  message?: string;
  code?: string;
};

function isAuthFailureStatus(status: number): boolean {
  return status === 401 || status === 403;
}

function isAuthFailureMessage(message: string): boolean {
  return /invalid or expired session|authentication required|session expired|unauthorized/i.test(
    message,
  );
}

async function postComposeSessionApi(
  input: {
    companyId: string;
    companyChannelId: string;
    conversationId: string;
    fromEmail?: string | null;
  },
  forceRefresh: boolean,
): Promise<{ response: Response; body: ComposeSessionApiBody }> {
  const base = resolveAuthenticatedApiBase();
  if (!base) {
    throw new Error("API base URL is not configured");
  }
  const token = await getFreshAccessToken({ forceRefresh });
  if (!token) {
    throw new Error("Authentication required to create the email compose session.");
  }
  const response = await fetch(`${base}/email/compose-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify({
      companyId: input.companyId,
      conversationId: input.conversationId,
      companyChannelId: input.companyChannelId,
      fromEmail: input.fromEmail ?? null,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as ComposeSessionApiBody;
  return { response, body };
}

/**
 * New Email conversations are created before any inbound webhook.
 * Bind them to channel_sessions so dispatchOutboundMessage can reuse
 * CommunicationDispatcher + EmailCloudAdapter.
 *
 * Prefer the authenticated API (service-role insert gated by reply permission)
 * because Email agents without channels.manage cannot insert channel_sessions under RLS
 * (requires channels.manage). Fall back to direct insert for admins.
 */
export async function ensureEmailComposeChannelSession(input: {
  companyId: string;
  companyChannelId: string;
  conversationId: string;
  fromEmail?: string | null;
}): Promise<ChannelSessionRow> {
  const existing = await resolveChannelSession(input.conversationId);
  if (existing?.id) return existing;

  if (isAuthenticatedApiConfigured() && resolveAuthenticatedApiBase()) {
    let { response, body } = await postComposeSessionApi(input, false);
    if (
      !response.ok &&
      (isAuthFailureStatus(response.status) ||
        isAuthFailureMessage(String(body.message || body.error || "")))
    ) {
      ({ response, body } = await postComposeSessionApi(input, true));
    }

    if (response.ok && body?.id) {
      return {
        id: body.id,
        external_thread_id: body.external_thread_id,
        channel_key: body.channel_key,
        company_channel_id: body.company_channel_id,
      };
    }

    if (isAuthFailureStatus(response.status) || isAuthFailureMessage(String(body.message || body.error || ""))) {
      throw new Error(body.message || body.error || "Invalid or expired session.");
    }
    if (response.status !== 404 && response.status !== 503) {
      throw new Error(body.message || body.error || `Compose session API failed (${response.status}).`);
    }
  }

  const insert = buildEmailComposeSessionInsert(input);
  const { data, error } = await supabase
    .from("channel_sessions")
    .insert(insert)
    .select("id, external_thread_id, channel_key, company_channel_id")
    .single();

  if (error) {
    const raced = await resolveChannelSession(input.conversationId);
    if (raced?.id) return raced;
    throw new Error(error.message);
  }
  if (!data?.id) {
    throw new Error("Channel session was not created for the new email conversation.");
  }
  return data;
}
