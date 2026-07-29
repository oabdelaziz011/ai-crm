import { normalizeEmailMessageId } from "./email-html-utils.js";

export type EmailThreadLookupResult = {
  conversationId: string;
  externalThreadId: string;
};

export type EmailThreadLookupPort = {
  findByExternalMessageId(
    companyChannelId: string,
    externalMessageId: string,
  ): Promise<EmailThreadLookupResult | null>;
};

export type ResolveEmailThreadInput = {
  messageId: string;
  inReplyTo?: string | null;
  references?: string[];
  fromEmail: string;
  subject?: string;
  companyChannelId: string;
  lookup: EmailThreadLookupPort;
};

export type ResolvedEmailThread = {
  externalThreadId: string;
  matchedBy?: "in_reply_to" | "references" | "new_thread";
  matchedMessageId?: string;
};

export async function resolveEmailThread(input: ResolveEmailThreadInput): Promise<ResolvedEmailThread> {
  const normalizedMessageId = normalizeEmailMessageId(input.messageId);
  const candidateIds: string[] = [];

  if (input.inReplyTo) {
    candidateIds.push(normalizeEmailMessageId(input.inReplyTo));
  }

  for (const reference of input.references ?? []) {
    const normalized = normalizeEmailMessageId(reference);
    if (normalized && !candidateIds.includes(normalized)) {
      candidateIds.push(normalized);
    }
  }

  for (const candidateId of candidateIds) {
    if (!candidateId) continue;
    const match = await input.lookup.findByExternalMessageId(input.companyChannelId, candidateId);
    if (match) {
      return {
        externalThreadId: match.externalThreadId,
        matchedBy: candidateId === normalizeEmailMessageId(input.inReplyTo) ? "in_reply_to" : "references",
        matchedMessageId: candidateId,
      };
    }
  }

  return {
    externalThreadId: normalizedMessageId || `email:${input.fromEmail}:${Date.now()}`,
    matchedBy: "new_thread",
  };
}

export function buildEmailReferencesHeader(input: {
  threadRootMessageId: string;
  priorReferences?: string[];
  inReplyTo?: string;
}): string[] {
  const refs = [...(input.priorReferences ?? [])];
  const normalizedRoot = normalizeEmailMessageId(input.threadRootMessageId);
  const normalizedReply = input.inReplyTo ? normalizeEmailMessageId(input.inReplyTo) : "";

  for (const id of [normalizedRoot, normalizedReply]) {
    if (id && !refs.includes(id)) refs.push(id);
  }

  return refs.filter(Boolean);
}
