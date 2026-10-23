/**
 * Full IANA timezone list for selects. Prefer Intl.supportedValuesOf when available;
 * fall back to a curated set so older browsers still get a usable dropdown.
 */
const FALLBACK_IANA_TIMEZONES = [
  "UTC",
  "Africa/Cairo",
  "Africa/Casablanca",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Sao_Paulo",
  "America/Toronto",
  "Asia/Baghdad",
  "Asia/Beirut",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Jakarta",
  "Asia/Jerusalem",
  "Asia/Kolkata",
  "Asia/Kuwait",
  "Asia/Qatar",
  "Asia/Riyadh",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Melbourne",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/Istanbul",
  "Europe/London",
  "Europe/Moscow",
  "Europe/Paris",
  "Pacific/Auckland",
] as const;

let cached: string[] | null = null;

export function listIanaTimeZones(): string[] {
  if (cached) return cached;
  const ensureCanonical = (zones: string[]) => {
    const set = new Set(zones);
    // Some runtimes list Etc/UTC but omit the canonical "UTC" alias we store in settings.
    set.add("UTC");
    if (set.has("Etc/UTC")) set.add("UTC");
    return [...set].sort((a, b) => a.localeCompare(b));
  };
  try {
    const intlWithZones = Intl as typeof Intl & {
      supportedValuesOf?: (key: string) => string[];
    };
    if (typeof intlWithZones.supportedValuesOf === "function") {
      const zones = intlWithZones.supportedValuesOf("timeZone");
      if (Array.isArray(zones) && zones.length > 0) {
        cached = ensureCanonical(zones);
        return cached;
      }
    }
  } catch {
    // Fall through to curated list.
  }
  cached = ensureCanonical([...FALLBACK_IANA_TIMEZONES]);
  return cached;
}

/** Options for a timezone <select>, ensuring the current value appears even if unknown. */
export function timezoneSelectOptions(current?: string | null): string[] {
  const zones = listIanaTimeZones();
  const trimmed = typeof current === "string" ? current.trim() : "";
  if (trimmed && !zones.includes(trimmed)) {
    return [trimmed, ...zones];
  }
  return zones;
}
