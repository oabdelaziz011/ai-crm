export type EmailWebhookRoutingResult =
  | { ok: true; companyChannelId: string; source: "url" | "to_email" }
  | { ok: false; code: "channel_not_found" | "duplicate_to_email"; message: string; matches?: Array<{ id: string }> };

export async function resolveEmailWebhookCompanyChannelId(input: {
  toEmail?: string | null;
  urlCompanyChannelId?: string;
  lookupByToEmail: (email: string) => Promise<Array<{ id: string; companyId: string }>>;
}): Promise<EmailWebhookRoutingResult> {
  if (input.urlCompanyChannelId?.trim()) {
    return { ok: true, companyChannelId: input.urlCompanyChannelId.trim(), source: "url" };
  }

  const toEmail = input.toEmail?.trim().toLowerCase();
  if (!toEmail) {
    return { ok: false, code: "channel_not_found", message: "Recipient email is required for routing." };
  }

  const matches = await input.lookupByToEmail(toEmail);
  if (matches.length === 0) {
    return { ok: false, code: "channel_not_found", message: `No email channel configured for ${toEmail}.` };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      code: "duplicate_to_email",
      message: `Multiple email channels match ${toEmail}.`,
      matches: matches.map((match) => ({ id: match.id })),
    };
  }

  return { ok: true, companyChannelId: matches[0]!.id, source: "to_email" };
}

export function summarizeEmailWebhookPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    kind: payload.kind ?? "email.inbound",
    messageId: payload.messageId ?? null,
    subject: payload.subject ?? null,
    from:
      payload.from && typeof payload.from === "object"
        ? (payload.from as Record<string, unknown>).email ?? null
        : payload.senderExternalId ?? null,
    attachmentCount: Array.isArray(payload.attachments) ? payload.attachments.length : 0,
  };
}

export function extractEmailRecipientAddress(payload: Record<string, unknown>): string | null {
  if (typeof payload.toEmail === "string" && payload.toEmail.trim()) {
    return payload.toEmail.trim().toLowerCase();
  }

  const to = payload.to;
  if (typeof to === "string" && to.trim()) {
    return to.trim().toLowerCase();
  }

  if (Array.isArray(to) && to.length > 0) {
    const first = to[0];
    if (typeof first === "string") return first.trim().toLowerCase();
    if (first && typeof first === "object") {
      const email = (first as Record<string, unknown>).email;
      if (typeof email === "string" && email.trim()) return email.trim().toLowerCase();
    }
  }

  return null;
}
