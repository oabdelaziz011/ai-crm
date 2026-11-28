/**
 * Match customer-entered place names (often Arabic) to company delivery zones
 * stored in English (or mixed). Used by validate_delivery_zone.
 */

/** Fold Arabic letters + lowercase for comparison. */
export function foldDeliveryPlaceText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\p{M}\u0640]+/gu, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/([\u0600-\u06FF])\1{2,}/gu, "$1")
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function compactPlaceKey(value: string): string {
  return foldDeliveryPlaceText(value).replace(/[\s\-_.]/g, "");
}

/** Synonym groups: any member matches any other (folded). */
const PLACE_SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["cairo", "القاهره", "القاهرة", "محافظة القاهرة", "محافظة القاهره"],
  ["giza", "الجيزه", "الجيزة", "محافظة الجيزة", "محافظة الجيزه"],
  ["alexandria", "الاسكندريه", "الإسكندرية", "اسكندريه"],
  [
    "nasr city",
    "nasrcity",
    "madinet nasr",
    "madinat nasr",
    "مدينه نصر",
    "مدينة نصر",
    "حى مدينه نصر",
    "مدينة نصر القاهرة",
  ],
  ["maadi", "el maadi", "el-maadi", "elmaadi", "المعادي", "المعادى"],
  ["dokki", "الدقي", "الدقى"],
  ["mohandessin", "mohandisin", "المهندسين"],
  ["heliopolis", "مصر الجديده", "مصر الجديدة"],
  ["zamalek", "الزمالك"],
  ["6th of october", "6 october", "السادس من اكتوبر", "٦ اكتوبر", "6 اكتوبر"],
  ["new cairo", "التجمع", "التجمع الخامس", "القاهره الجديده", "القاهرة الجديدة"],
  ["shubra", "شبرا"],
  ["ain shams", "عين شمس"],
];

function expandSynonymKeys(value: string): Set<string> {
  const folded = foldDeliveryPlaceText(value);
  const compact = compactPlaceKey(value);
  const keys = new Set<string>();
  if (folded) keys.add(folded);
  if (compact) keys.add(compact);
  for (const group of PLACE_SYNONYM_GROUPS) {
    const groupKeys = group.flatMap((member) => {
      const f = foldDeliveryPlaceText(member);
      const c = compactPlaceKey(member);
      return [f, c].filter(Boolean);
    });
    if (groupKeys.some((k) => keys.has(k))) {
      for (const k of groupKeys) keys.add(k);
    }
  }
  return keys;
}

function setsOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const key of a) {
    if (b.has(key)) return true;
  }
  return false;
}

export type DeliveryZoneMatchCandidate = {
  id: string;
  governorate: string;
  zoneName: string;
  aliases?: string[] | null;
};

/**
 * True when customer governorate+zone match a stored zone (name, aliases, or synonym map).
 */
export function deliveryZoneMatchesInput(
  candidate: DeliveryZoneMatchCandidate,
  input: { governorate: string; zoneName: string },
): boolean {
  const inputGov = expandSynonymKeys(input.governorate);
  const inputZone = expandSynonymKeys(input.zoneName);
  if (inputGov.size === 0 || inputZone.size === 0) return false;

  const zoneGov = expandSynonymKeys(candidate.governorate);
  if (!setsOverlap(inputGov, zoneGov)) return false;

  const zoneNames = expandSynonymKeys(candidate.zoneName);
  for (const alias of candidate.aliases ?? []) {
    for (const key of expandSynonymKeys(alias)) zoneNames.add(key);
  }
  return setsOverlap(inputZone, zoneNames);
}

/** All enabled candidates that match the customer input. */
export function findAllMatchingDeliveryZones<T extends DeliveryZoneMatchCandidate>(
  zones: T[],
  input: { governorate: string; zoneName: string },
): T[] {
  return zones.filter((zone) => deliveryZoneMatchesInput(zone, input));
}

/**
 * Exact single match only. Returns null when zero or multiple zones match
 * (callers should treat multiple as ambiguous and ask for clarification).
 */
export function findMatchingDeliveryZone<T extends DeliveryZoneMatchCandidate>(
  zones: T[],
  input: { governorate: string; zoneName: string },
): T | null {
  const matches = findAllMatchingDeliveryZones(zones, input);
  return matches.length === 1 ? matches[0]! : null;
}
