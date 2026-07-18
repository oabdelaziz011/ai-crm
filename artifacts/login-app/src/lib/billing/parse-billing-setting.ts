export function parseBillingSettingString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "string" ? parsed : String(parsed);
    } catch {
      return value;
    }
  }
  if (typeof value === "object" && value !== null && "value" in (value as Record<string, unknown>)) {
    return parseBillingSettingString((value as Record<string, unknown>).value);
  }
  return String(value).replace(/^"|"$/g, "");
}
