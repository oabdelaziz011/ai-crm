import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import { useDebouncedValue } from "@/lib/customers-list/use-debounced-value";
import {
  EMAIL_RECIPIENT_SUGGEST_DEBOUNCE_MS,
  EMAIL_RECIPIENT_SUGGEST_LIMIT,
  shouldRequestRecipientSuggestions,
  type EmailRecipientSuggestion,
  type EmailRecipientSuggestionCandidate,
} from "@/lib/email-workspace/email-recipient-suggestions";
import { searchEmailRecipientSuggestions } from "@/lib/email-workspace/search-email-recipient-suggestions";

export function useEmailRecipientSuggestions(input: {
  query: string;
  excludeEmails: readonly string[];
  participantCandidates: readonly EmailRecipientSuggestionCandidate[];
  enabled?: boolean;
}): {
  suggestions: EmailRecipientSuggestion[];
  isFetching: boolean;
  debouncedQuery: string;
} {
  const { user, profile } = useAuth();
  const { hasCompanyPermission, isSuperAdmin } = useCompanyPermissionAuth();
  // Authoritative tenant: authenticated profile.company_id only.
  const companyId = profile?.company_id?.trim() || null;
  const debouncedQuery = useDebouncedValue(input.query, EMAIL_RECIPIENT_SUGGEST_DEBOUNCE_MS);
  const enabled =
    input.enabled !== false &&
    Boolean(companyId && user?.id) &&
    shouldRequestRecipientSuggestions(debouncedQuery);

  const excludeKey = useMemo(
    () =>
      [...input.excludeEmails]
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
        .sort()
        .join("|"),
    [input.excludeEmails],
  );

  const query = useQuery({
    queryKey: [
      "email-recipient-suggestions",
      companyId,
      debouncedQuery.trim().toLowerCase(),
      excludeKey,
      // Bound participant fingerprint (length + first few emails) — avoid huge keys.
      input.participantCandidates.length,
    ],
    enabled,
    staleTime: 15_000,
    // Do not keep previous query's rows when the debounced term changes (stale overwrite guard).
    placeholderData: undefined,
    queryFn: async (): Promise<EmailRecipientSuggestion[]> => {
      if (!companyId || !user?.id) return [];
      return searchEmailRecipientSuggestions({
        companyId,
        query: debouncedQuery,
        excludeEmails: input.excludeEmails,
        participantCandidates: input.participantCandidates,
        limit: EMAIL_RECIPIENT_SUGGEST_LIMIT,
        portContext: {
          companyId,
          actorUserId: user.id,
          isSuperAdmin,
          hasPermission: hasCompanyPermission,
        },
      });
    },
  });

  return {
    suggestions: enabled ? (query.data ?? []) : [],
    isFetching: query.isFetching,
    debouncedQuery,
  };
}
