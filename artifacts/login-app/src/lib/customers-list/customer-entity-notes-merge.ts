/**
 * Pure merge of notes + channel-history tags for the customers list.
 */

export type CustomerListChannelContactKey = "whatsapp" | "email" | "sms";

export type CustomerListChannelContactMap = Map<string, Set<CustomerListChannelContactKey>>;

const CONTACT_DERIVED_TAGS = new Set(["email", "phone"]);

/**
 * Rebuild list tags:
 * - Drop contact-field-derived email/phone (list shows channel history instead)
 * - Add notes from legacy pinned blob and/or entity notes
 * - Add whatsapp / email / sms from prior conversations
 */
export function mergeCustomerListPresenceTags<
  T extends { customer: { id: string; notes?: string | null }; tags: string[] },
>(
  rows: T[],
  input: {
    entityNoteCustomerIds?: Set<string>;
    channelContacts?: CustomerListChannelContactMap;
  },
): T[] {
  const entityNotes = input.entityNoteCustomerIds;
  const channels = input.channelContacts;

  return rows.map((row) => {
    const next = new Set(row.tags.filter((tag) => !CONTACT_DERIVED_TAGS.has(tag)));

    const hasLegacyNotes = Boolean(row.customer.notes?.trim());
    const hasEntityNotes = entityNotes?.has(row.customer.id) === true;
    if (hasLegacyNotes || hasEntityNotes) next.add("notes");

    const contacted = channels?.get(row.customer.id);
    if (contacted) {
      for (const key of contacted) next.add(key);
    }

    return { ...row, tags: [...next] };
  });
}

/** @deprecated Prefer mergeCustomerListPresenceTags — kept for older call sites/tests. */
export function mergeEntityNoteTagsIntoRows<
  T extends { customer: { id: string; notes?: string | null }; tags: string[] },
>(rows: T[], entityNoteCustomerIds: Set<string> | undefined): T[] {
  return mergeCustomerListPresenceTags(rows, { entityNoteCustomerIds });
}
