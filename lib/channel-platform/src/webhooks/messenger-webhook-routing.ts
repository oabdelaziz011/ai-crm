export type MessengerWebhookRoutingMatch = {
  id: string;
  companyId: string;
};

export type ResolveMessengerWebhookCompanyChannelInput = {
  pageId: string | null;
  urlCompanyChannelId?: string;
  lookupByPageId: (pageId: string) => Promise<MessengerWebhookRoutingMatch[]>;
  diagnose?: (stage: string, detail?: Record<string, unknown>) => void;
};

export type ResolveMessengerWebhookCompanyChannelResult =
  | {
      ok: true;
      companyChannelId: string;
      source: "page_id" | "url_fallback";
    }
  | {
      ok: false;
      code: "duplicate_page_id";
      pageId: string;
      matches: MessengerWebhookRoutingMatch[];
    }
  | {
      ok: false;
      code: "no_channel";
      message: string;
    };

export async function resolveMessengerWebhookCompanyChannelId(
  input: ResolveMessengerWebhookCompanyChannelInput,
): Promise<ResolveMessengerWebhookCompanyChannelResult> {
  const pageId = input.pageId?.trim() || null;
  const urlCompanyChannelId = input.urlCompanyChannelId?.trim() || null;
  const diag = input.diagnose;

  diag?.("routing.start", { pageId, urlCompanyChannelId });

  if (pageId) {
    const matches = await input.lookupByPageId(pageId);
    diag?.("routing.lookup_by_page_id.result", { pageId, matchCount: matches.length });

    if (matches.length > 1) {
      return { ok: false, code: "duplicate_page_id", pageId, matches };
    }

    if (matches.length === 1) {
      return {
        ok: true,
        companyChannelId: matches[0]!.id,
        source: "page_id",
      };
    }
  }

  if (urlCompanyChannelId) {
    diag?.("routing.url_fallback", { urlCompanyChannelId });
    return {
      ok: true,
      companyChannelId: urlCompanyChannelId,
      source: "url_fallback",
    };
  }

  return {
    ok: false,
    code: "no_channel",
    message: pageId
      ? `No enabled Messenger channel is configured for page ${pageId}.`
      : "Messenger webhook payload did not include a routable page id.",
  };
}
