export type InstagramWebhookRoutingMatch = {
  id: string;
  companyId: string;
};

export type ResolveInstagramWebhookCompanyChannelInput = {
  instagramBusinessAccountId: string | null;
  urlCompanyChannelId?: string;
  lookupByInstagramBusinessAccountId: (
    instagramBusinessAccountId: string,
  ) => Promise<InstagramWebhookRoutingMatch[]>;
  onInstagramBusinessAccountIdReconciled?: (input: {
    companyChannelId: string;
    previousInstagramBusinessAccountId: string | null;
    instagramBusinessAccountId: string;
  }) => void | Promise<void>;
  diagnose?: (stage: string, detail?: Record<string, unknown>) => void;
};

export type ResolveInstagramWebhookCompanyChannelResult =
  | {
      ok: true;
      companyChannelId: string;
      source: "instagram_business_account" | "url_fallback";
    }
  | {
      ok: false;
      code: "duplicate_instagram_business_account";
      instagramBusinessAccountId: string;
      matches: InstagramWebhookRoutingMatch[];
    }
  | {
      ok: false;
      code: "no_channel";
      message: string;
    };

export async function resolveInstagramWebhookCompanyChannelId(
  input: ResolveInstagramWebhookCompanyChannelInput,
): Promise<ResolveInstagramWebhookCompanyChannelResult> {
  const instagramBusinessAccountId = input.instagramBusinessAccountId?.trim() || null;
  const urlCompanyChannelId = input.urlCompanyChannelId?.trim() || null;
  const diag = input.diagnose;

  diag?.("routing.start", { instagramBusinessAccountId, urlCompanyChannelId });

  if (instagramBusinessAccountId) {
    const matches = await input.lookupByInstagramBusinessAccountId(instagramBusinessAccountId);
    diag?.("routing.lookup_by_instagram_business_account_id.result", {
      instagramBusinessAccountId,
      matchCount: matches.length,
    });

    if (matches.length > 1) {
      return {
        ok: false,
        code: "duplicate_instagram_business_account",
        instagramBusinessAccountId,
        matches,
      };
    }

    if (matches.length === 1) {
      return {
        ok: true,
        companyChannelId: matches[0]!.id,
        source: "instagram_business_account",
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
    message: instagramBusinessAccountId
      ? `No enabled Instagram channel is configured for business account ${instagramBusinessAccountId}.`
      : "Instagram webhook payload did not include a routable business account id.",
  };
}
