/**
 * Enterprise CRM naming — opportunity title is the deal, never the contact person.
 */
export function resolveDefaultOpportunityNameFromLead(input: {
  title: string;
  companyName?: string | null;
}): string {
  const title = input.title.trim();
  const company = input.companyName?.trim() ?? "";
  if (company && title) return `${company} — ${title}`;
  return title || company;
}
