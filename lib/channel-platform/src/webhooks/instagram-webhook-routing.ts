export type InstagramWebhookRoutingMatch = {
  id: string;
  companyId: string;
  /** Optional ranking hints so a unique live connection can win over a stale duplicate. */
  channelEnabled?: boolean | null;
  settingsEnabled?: boolean | null;
  connectionStatus?: string | null;
  webhookSubscriptionStatus?: string | null;
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

/** Higher score = prefer for inbound when the same IG BA id is bound to multiple tenants. */
export function scoreInstagramWebhookRoutingMatch(match: InstagramWebhookRoutingMatch): number {
  let score = 0;
  if (match.channelEnabled !== false) score += 1;
  if (match.settingsEnabled !== false) score += 1;
  if (String(match.connectionStatus ?? "").trim() === "connected") score += 4;
  if (String(match.webhookSubscriptionStatus ?? "").trim() === "subscribed") score += 2;
  return score;
}

function pickUniqueLiveInstagramMatch(
  matches: InstagramWebhookRoutingMatch[],
): InstagramWebhookRoutingMatch | null {
  if (matches.length <= 1) return matches[0] ?? null;
  const ranked = [...matches].sort(
    (a, b) => scoreInstagramWebhookRoutingMatch(b) - scoreInstagramWebhookRoutingMatch(a),
  );
  const best = ranked[0]!;
  const second = ranked[1]!;
  const bestScore = scoreInstagramWebhookRoutingMatch(best);
  const secondScore = scoreInstagramWebhookRoutingMatch(second);
  // Require a clear live winner (connected + subscribed at minimum).
  if (bestScore >= 6 && bestScore > secondScore) return best;
  return null;
}

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
      const winner = pickUniqueLiveInstagramMatch(matches);
      diag?.("routing.duplicate_instagram_business_account", {
        instagramBusinessAccountId,
        matchCount: matches.length,
        resolvedCompanyChannelId: winner?.id ?? null,
      });
      if (winner) {
        return {
          ok: true,
          companyChannelId: winner.id,
          source: "instagram_business_account",
        };
      }
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
