/** Workflow + DB storage values (lowercase). */
export const STANDARD_GENDER_STORAGE_VALUES = [
  "male",
  "female",
  "other",
  "prefer not to say",
] as const;

const GENDER_STORAGE_ALIASES: Record<string, (typeof STANDARD_GENDER_STORAGE_VALUES)[number]> = {
  male: "male",
  female: "female",
  other: "other",
  "prefer not to say": "prefer not to say",
};

/**
 * Normalizes gender from DB/workflow (male, female, legacy Male/Female) to Select value.
 */
export function normalizeGenderStorageValue(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const key = raw.trim().toLowerCase();
  return GENDER_STORAGE_ALIASES[key as keyof typeof GENDER_STORAGE_ALIASES] ?? key;
}

export type GenderOptionLabels = {
  male: string;
  female: string;
  other: string;
  preferNotToSay: string;
};

export function buildGenderSelectOptions(
  labels: GenderOptionLabels,
  customerGender?: string | null,
): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [
    { value: "male", label: labels.male },
    { value: "female", label: labels.female },
    { value: "other", label: labels.other },
    { value: "prefer not to say", label: labels.preferNotToSay },
  ];

  const normalized = normalizeGenderStorageValue(customerGender);
  const known = new Set<string>(STANDARD_GENDER_STORAGE_VALUES);
  if (normalized && !known.has(normalized)) {
    options.push({ value: normalized, label: customerGender!.trim() });
  }

  return options;
}

export function genderDisplayLabel(
  raw: string | null | undefined,
  labels: GenderOptionLabels,
): string | undefined {
  if (raw == null || !raw.trim()) return undefined;
  const normalized = normalizeGenderStorageValue(raw);
  const option = buildGenderSelectOptions(labels, raw).find((entry) => entry.value === normalized);
  return option?.label ?? raw.trim();
}
