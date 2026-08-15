export type BilingualMapKey =
  | "messages"
  | "questions"
  | "prompts"
  | "titles"
  | "bodies"
  | "buttonLabels";

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function looksArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

export function readBilingualMap(
  config: Record<string, unknown>,
  mapKey: BilingualMapKey,
  baseField: string,
  alternateMapKeys: BilingualMapKey[] = [],
  alternateBaseFields: string[] = [],
): { ar: string; en: string } {
  const mapKeys = [mapKey, ...alternateMapKeys];
  for (const key of mapKeys) {
    const map =
      config[key] && typeof config[key] === "object" && !Array.isArray(config[key])
        ? (config[key] as Record<string, unknown>)
        : null;
    if (!map) continue;
    const ar = readString(map.ar);
    const en = readString(map.en);
    if (ar || en) return { ar, en };
  }

  for (const field of [baseField, ...alternateBaseFields]) {
    const legacy = readString(config[field]);
    if (!legacy) continue;
    return looksArabic(legacy) ? { ar: legacy, en: "" } : { ar: "", en: legacy };
  }

  return { ar: "", en: "" };
}

export function hasBilingualOrLegacyText(
  config: Record<string, unknown>,
  mapKey: BilingualMapKey,
  baseField: string,
  alternateMapKeys: BilingualMapKey[] = [],
  alternateBaseFields: string[] = [],
): boolean {
  const { ar, en } = readBilingualMap(config, mapKey, baseField, alternateMapKeys, alternateBaseFields);
  return Boolean(ar.trim() || en.trim());
}

export function bilingualMapPassthrough(
  config: Record<string, unknown>,
  mapKey: BilingualMapKey,
): Record<string, unknown> {
  const map = config[mapKey];
  if (map && typeof map === "object" && !Array.isArray(map)) {
    return { [mapKey]: map };
  }
  return {};
}
