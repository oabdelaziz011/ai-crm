import { supabase } from "@/lib/supabase";
import {
  isAuthenticatedApiConfigured,
  resolveAuthenticatedApiBase,
} from "@/lib/api-server/normalize-api-base";
import type { OutboundDispatchResponseDto } from "@workspace/channel-platform/client";
import type { ComposerMention } from "@/lib/omnichannel/types/composer-enterprise-types";

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export type OmnichannelOutboundDispatchPayload = {
  companyId: string;
  conversationId: string;
  companyChannelId: string;
  channelKey: string;
  channelSessionId: string;
  externalThreadId: string;
  text: string;
  attachments?: Array<{
    attachmentId: string;
    type: "image" | "document" | "audio" | "video" | "text" | "template";
    url?: string;
    mimeType?: string;
    filename?: string;
    caption?: string;
    metadata?: Record<string, unknown>;
  }>;
  outboundMessageId?: string;
  metadata?: Record<string, unknown> & {
    source?: string;
    conversationMessageId?: string;
    mentions?: ComposerMention[];
  };
  persistConversationMessage?: boolean;
};

export function isOmnichannelOutboundApiConfigured(): boolean {
  return isAuthenticatedApiConfigured();
}

export async function dispatchOmnichannelOutboundViaApi(
  payload: OmnichannelOutboundDispatchPayload,
): Promise<OutboundDispatchResponseDto> {
  const base = resolveAuthenticatedApiBase();
  if (!base) {
    throw new Error("VITE_API_SERVER_URL is not configured");
  }

  const response = await fetch(`${base}/omnichannel/outbound/dispatch`, {
    method: "POST",
    headers: await buildAuthHeaders(),
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as OutboundDispatchResponseDto & {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(body.message ?? body.error ?? `Omnichannel outbound dispatch failed (${response.status})`);
  }

  return body;
}
