/**
 * Company-scoped email recipient suggestion search.
 * Customers via CustomerReadPort; participants from trusted company conversation metadata only.
 */
import { createLoginAppCustomerReadPort } from "@/lib/application-layer/adapters/customer-read-port-adapter";
import type { LoginAppPortContext } from "@/lib/application-layer/adapters/customer-read-port-adapter";
import {
  EMAIL_RECIPIENT_SUGGEST_LIMIT,
  filterParticipantCandidates,
  rankAndMergeRecipientSuggestions,
  shouldRequestRecipientSuggestions,
  type EmailRecipientSuggestion,
  type EmailRecipientSuggestionCandidate,
} from "@/lib/email-workspace/email-recipient-suggestions";

export type SearchEmailRecipientSuggestionsInput = {
  /** Must be authenticated profile.company_id — never from URL/body. */
  companyId: string;
  query: string;
  excludeEmails?: readonly string[];
  /** Already company-scoped conversation participant candidates. */
  participantCandidates?: readonly EmailRecipientSuggestionCandidate[];
  limit?: number;
  portContext: LoginAppPortContext;
  /** Optional injectable customer search for tests. */
  searchCustomers?: (
    companyId: string,
    query: string,
    limit: number,
  ) => Promise<EmailRecipientSuggestionCandidate[]>;
};

/**
 * Search suggestions for the composer autocomplete.
 * Returns [] when query is too short, company mismatches, or permission denied.
 */
export async function searchEmailRecipientSuggestions(
  input: SearchEmailRecipientSuggestionsInput,
): Promise<EmailRecipientSuggestion[]> {
  const companyId = input.companyId.trim();
  if (!companyId) return [];
  // Hard tenant boundary: port context company must match authenticated companyId.
  if (input.portContext.companyId !== companyId) return [];
  if (!shouldRequestRecipientSuggestions(input.query)) return [];

  const limit = input.limit ?? EMAIL_RECIPIENT_SUGGEST_LIMIT;
  const exclude = input.excludeEmails ?? [];

  const searchCustomers =
    input.searchCustomers ??
    (async (tenantId: string, query: string, max: number) => {
      // Lazy import so unit tests can call this module with an injected searchCustomers
      // without requiring Vite browser env (VITE_SUPABASE_URL).
      const { supabase } = await import("@/lib/supabase");
      const port = createLoginAppCustomerReadPort(supabase, input.portContext);
      const rows = await port.search(tenantId, query, max);
      return rows
        .filter((row) => row.tenantId === tenantId && typeof row.email === "string" && row.email.includes("@"))
        .map(
          (row): EmailRecipientSuggestionCandidate => ({
            email: String(row.email),
            displayName: row.displayName?.trim() || null,
            customerId: row.id,
            source: "customer",
          }),
        );
    });

  let customers: EmailRecipientSuggestionCandidate[] = [];
  try {
    customers = await searchCustomers(companyId, input.query.trim(), limit);
  } catch {
    customers = [];
  }

  customers = customers.filter((row) => Boolean(row.email?.includes("@")));

  const participants = filterParticipantCandidates(
    input.participantCandidates ?? [],
    input.query,
    exclude,
    limit,
  );

  return rankAndMergeRecipientSuggestions({
    query: input.query,
    customers,
    participants,
    excludeEmails: exclude,
    limit,
  });
}
