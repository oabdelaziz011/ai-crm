export type WhatsAppWebhookRoutingMatch = {
  id: string;
  companyId: string;
};

export type ResolveWhatsAppWebhookCompanyChannelInput = {
  phoneNumberId: string | null;
  urlCompanyChannelId?: string;
  lookupByPhoneNumberId: (phoneNumberId: string) => Promise<WhatsAppWebhookRoutingMatch[]>;
  /** When DB phoneNumberId is stale, probe channel credentials against Meta Graph API. */
  lookupByCredentialProbe?: (phoneNumberId: string) => Promise<WhatsAppWebhookRoutingMatch | null>;
  onPhoneNumberIdReconciled?: (input: {
    companyChannelId: string;
    previousPhoneNumberId: string | null;
    phoneNumberId: string;
  }) => void | Promise<void>;
  /** Temporary diagnostics — logs routing branch decisions without changing behavior. */
  diagnose?: (stage: string, detail?: Record<string, unknown>) => void;
};

export type ResolveWhatsAppWebhookCompanyChannelResult =
  | {
      ok: true;
      companyChannelId: string;
      source: "phone_number" | "url_fallback" | "credential_probe";
    }
  | {
      ok: false;
      code: "duplicate_phone_number";
      phoneNumberId: string;
      matches: WhatsAppWebhookRoutingMatch[];
    }
  | {
      ok: false;
      code: "no_channel";
      message: string;
    };

export function extractWhatsAppPhoneNumberId(rawPayload: Record<string, unknown>): string | null {
  const entries = rawPayload.entry;
  if (!Array.isArray(entries)) return null;

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const changes = (entry as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as { value?: unknown }).value;
      if (!value || typeof value !== "object") continue;
      const metadata = (value as { metadata?: unknown }).metadata;
      if (!metadata || typeof metadata !== "object") continue;
      const phoneNumberId = (metadata as { phone_number_id?: unknown }).phone_number_id;
      if (typeof phoneNumberId === "string" && phoneNumberId.trim()) {
        return phoneNumberId.trim();
      }
    }
  }

  return null;
}

export async function resolveWhatsAppWebhookCompanyChannelId(
  input: ResolveWhatsAppWebhookCompanyChannelInput,
): Promise<ResolveWhatsAppWebhookCompanyChannelResult> {
  const phoneNumberId = input.phoneNumberId?.trim() || null;
  const urlCompanyChannelId = input.urlCompanyChannelId?.trim() || null;
  const diag = input.diagnose;

  diag?.("routing.start", { phoneNumberId, urlCompanyChannelId });

  if (phoneNumberId) {
    diag?.("routing.lookup_by_phone_number_id.start", { phoneNumberId });
    const matches = await input.lookupByPhoneNumberId(phoneNumberId);
    diag?.("routing.lookup_by_phone_number_id.result", {
      phoneNumberId,
      matchCount: matches.length,
      matchIds: matches.map((match) => match.id),
      matchCompanyIds: matches.map((match) => match.companyId),
    });

    if (matches.length > 1) {
      const companyIds = new Set(matches.map((match) => match.companyId));
      if (companyIds.size === 1) {
        diag?.("routing.resolved", {
          source: "phone_number",
          companyChannelId: matches[0]!.id,
          phoneNumberId,
          collapsedDuplicateCompanyChannels: matches.length,
        });
        return {
          ok: true,
          companyChannelId: matches[0]!.id,
          source: "phone_number",
        };
      }

      diag?.("routing.early_return", {
        code: "duplicate_phone_number",
        phoneNumberId,
        matchCount: matches.length,
      });
      return {
        ok: false,
        code: "duplicate_phone_number",
        phoneNumberId,
        matches,
      };
    }

    if (matches.length === 1) {
      diag?.("routing.resolved", {
        source: "phone_number",
        companyChannelId: matches[0]!.id,
        phoneNumberId,
      });
      return {
        ok: true,
        companyChannelId: matches[0]!.id,
        source: "phone_number",
      };
    }

    diag?.("routing.lookup_by_phone_number_id.miss", {
      phoneNumberId,
      credentialProbeAvailable: Boolean(input.lookupByCredentialProbe),
    });

    if (input.lookupByCredentialProbe) {
      diag?.("routing.credential_probe.start", { phoneNumberId });
      const probed = await input.lookupByCredentialProbe(phoneNumberId);
      diag?.("routing.credential_probe.result", {
        phoneNumberId,
        matched: Boolean(probed),
        companyChannelId: probed?.id ?? null,
        companyId: probed?.companyId ?? null,
      });

      if (probed) {
        await input.onPhoneNumberIdReconciled?.({
          companyChannelId: probed.id,
          previousPhoneNumberId: null,
          phoneNumberId,
        });
        diag?.("routing.resolved", {
          source: "credential_probe",
          companyChannelId: probed.id,
          phoneNumberId,
        });
        return {
          ok: true,
          companyChannelId: probed.id,
          source: "credential_probe",
        };
      }
    }
  } else {
    diag?.("routing.phone_number_id_missing", { urlCompanyChannelId });
  }

  if (urlCompanyChannelId) {
    diag?.("routing.resolved", {
      source: "url_fallback",
      companyChannelId: urlCompanyChannelId,
      phoneNumberId,
    });
    return {
      ok: true,
      companyChannelId: urlCompanyChannelId,
      source: "url_fallback",
    };
  }

  const message = phoneNumberId
    ? `No WhatsApp company channel is configured for phone number ID ${phoneNumberId}.`
    : "WhatsApp webhook payload did not include metadata.phone_number_id and no legacy channel URL was provided.";

  diag?.("routing.early_return", {
    code: "no_channel",
    httpError: "channel_not_found",
    phoneNumberId,
    urlCompanyChannelId,
    message,
    reason: phoneNumberId
      ? "phone_number_id_not_in_db_and_credential_probe_miss_and_no_url_fallback"
      : "missing_phone_number_id_and_no_url_fallback",
  });

  return {
    ok: false,
    code: "no_channel",
    message,
  };
}
