/**
 * Detect explicit change/reschedule intent for AI Decision runtime fallback.
 * Used only when a workflow actually configures a `reschedule` outcome.
 *
 * Must not treat generic موعد / حجز / "book" as reschedule.
 */

const ARABIC_ALEF = /[أإآٱ]/g;
const PUNCTUATION = /[؟?!.,;:"""'']/g;
const DIACRITICS = /[\u064B-\u065F\u0670]/g;

const ARABIC_CHANGE_ACTION =
  /تغيير|اغير|نغير|يغير|تعديل|اعدل|نعدل|يعدل|تاجيل|ااجل|ناجل|اعادة\s*جدولة|اعد\s*جدولة|اعادة\s*حجز/;

const ARABIC_APPOINTMENT_CONTEXT = /موعد|ميعاد|حجز/;

const AVAILABILITY_NEGATION = /غير\s*(متاح|متوفر|ممكن)/;

const ENGLISH_RESCHEDULE_WORD = /\breschedul(?:e|ed|ing)\b/;
const ENGLISH_CHANGE_WORD = /\b(?:change|changed|changing|move|moved|moving|postpone|postponed|postponing)\b/;
const ENGLISH_APPOINTMENT_CONTEXT = /\b(?:appointment|appointments|booking|bookings)\b/;

export function normalizeRescheduleIntentText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(DIACRITICS, "")
    .replace(PUNCTUATION, " ")
    .replace(ARABIC_ALEF, "ا")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksLikeExplicitRescheduleIntent(value: unknown): boolean {
  const normalized = normalizeRescheduleIntentText(value);
  if (!normalized) return false;

  if (ENGLISH_RESCHEDULE_WORD.test(normalized)) return true;

  if (ENGLISH_CHANGE_WORD.test(normalized) && ENGLISH_APPOINTMENT_CONTEXT.test(normalized)) {
    return true;
  }

  if (AVAILABILITY_NEGATION.test(normalized) && !ARABIC_CHANGE_ACTION.test(normalized)) {
    return false;
  }

  return ARABIC_CHANGE_ACTION.test(normalized) && ARABIC_APPOINTMENT_CONTEXT.test(normalized);
}
