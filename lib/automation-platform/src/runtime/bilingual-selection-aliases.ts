/**
 * Map bilingual button/list titles (and free-text aliases) to stable selection IDs.
 * Routing stays ID-based; labels can be Arabic or English.
 */

const ALIAS_TO_ID: Record<string, string> = {
  // book — display titles / free-text only (do not remap opaque ids like "booking")
  book: "book",
  "book appointment": "book",
  "book an appointment": "book",
  booking: "book",
  حجز: "book",
  احجز: "book",
  "عايز احجز": "book",
  "عايز أحجز": "book",
  "أريد الحجز": "book",
  "أريد أن أحجز": "book",
  "حجز موعد": "book",
  // pricing
  pricing: "pricing",
  prices: "pricing",
  price: "pricing",
  cost: "pricing",
  costs: "pricing",
  "how much": "pricing",
  الأسعار: "pricing",
  اسعار: "pricing",
  السعر: "pricing",
  سعر: "pricing",
  تكلفة: "pricing",
  التكاليف: "pricing",
  "كام السعر": "pricing",
  "كام الاسعار": "pricing",
  "كام الأسعار": "pricing",
  "عايز اسعار": "pricing",
  "عايز أسعار": "pricing",
  "اسعار وتكلفة": "pricing",
  "أسعار وتكلفة": "pricing",
  // support
  support: "support",
  help: "support",
  "talk to support": "support",
  دعم: "support",
  مساعدة: "support",
  "تحدث مع الدعم": "support",
  // yes / no
  yes: "yes",
  no: "no",
  نعم: "yes",
  لا: "no",
  // gender (common clinic lists)
  male: "male",
  female: "female",
  ذكر: "male",
  رجل: "male",
  أنثى: "female",
  انثى: "female",
  امرأة: "female",
};

/** Longer phrases first so "كام السعر" wins over "سعر". */
const CONTAINS_KEYWORDS: Array<{ needle: string; id: string }> = [
  { needle: "اسعار وتكلفة", id: "pricing" },
  { needle: "أسعار وتكلفة", id: "pricing" },
  { needle: "كام الأسعار", id: "pricing" },
  { needle: "كام الاسعار", id: "pricing" },
  { needle: "كام السعر", id: "pricing" },
  { needle: "عايز أسعار", id: "pricing" },
  { needle: "عايز اسعار", id: "pricing" },
  { needle: "book appointment", id: "book" },
  { needle: "حجز موعد", id: "book" },
  { needle: "عايز أحجز", id: "book" },
  { needle: "عايز احجز", id: "book" },
  { needle: "talk to support", id: "support" },
  { needle: "تحدث مع الدعم", id: "support" },
  { needle: "الأسعار", id: "pricing" },
  { needle: "اسعار", id: "pricing" },
  { needle: "السعر", id: "pricing" },
  { needle: "تكلفة", id: "pricing" },
  { needle: "التكاليف", id: "pricing" },
  { needle: "pricing", id: "pricing" },
  { needle: "prices", id: "pricing" },
  { needle: "price", id: "pricing" },
  { needle: "cost", id: "pricing" },
  { needle: "سعر", id: "pricing" },
  { needle: "booking", id: "book" },
  { needle: "احجز", id: "book" },
  { needle: "حجز", id: "book" },
  { needle: "book", id: "book" },
  { needle: "support", id: "support" },
  { needle: "مساعدة", id: "support" },
  { needle: "دعم", id: "support" },
  { needle: "help", id: "support" },
];

function normalizeAliasKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function matchContainsAlias(normalized: string): string | null {
  for (const entry of CONTAINS_KEYWORDS) {
    if (normalized.includes(normalizeAliasKey(entry.needle))) {
      return entry.id;
    }
  }
  return null;
}

/**
 * If the inbound id/title is a known AR/EN alias, return the canonical id.
 * Supports exact match and phrase-contains (e.g. "اسعار وتكلفة" → pricing).
 * Otherwise return the original trimmed value.
 */
export function canonicalizeSelectionId(
  replyId: string | null | undefined,
  title?: string | null | undefined,
): string | null {
  const id = typeof replyId === "string" ? replyId.trim() : "";
  const label = typeof title === "string" ? title.trim() : "";

  if (id) {
    const byIdExact = ALIAS_TO_ID[normalizeAliasKey(id)];
    if (byIdExact) return byIdExact;
    const byIdContains = matchContainsAlias(normalizeAliasKey(id));
    if (byIdContains) return byIdContains;
    // Stable UUID / ISO / opaque ids pass through.
    if (id.includes("-") || /^\d{4}-\d{2}-\d{2}/.test(id) || id.includes("T")) {
      return id;
    }
  }

  if (label) {
    const byLabelExact = ALIAS_TO_ID[normalizeAliasKey(label)];
    if (byLabelExact) return byLabelExact;
    const byLabelContains = matchContainsAlias(normalizeAliasKey(label));
    if (byLabelContains) return byLabelContains;
  }

  return id || label || null;
}

/**
 * Resolve a free-text customer message to a menu selection id when waiting
 * on Buttons/List. Returns null when no intent alias matches.
 */
export function resolveFreeTextSelectionId(text: string | null | undefined): string | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const exact = ALIAS_TO_ID[normalizeAliasKey(trimmed)];
  if (exact) return exact;
  return matchContainsAlias(normalizeAliasKey(trimmed));
}
