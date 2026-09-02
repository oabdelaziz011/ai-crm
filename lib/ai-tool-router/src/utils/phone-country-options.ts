/**
 * Phone region options derived from libphonenumber-js — no hand-maintained country list.
 */
import {
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js/max";

export type PhoneCountryOption = {
  iso: CountryCode;
  callingCode: string;
};

let cached: PhoneCountryOption[] | null = null;

/** All regions supported by libphonenumber, sorted by ISO for stable UI. */
export function listPhoneCountryOptions(): PhoneCountryOption[] {
  if (cached) return cached;
  cached = getCountries()
    .map((iso) => ({
      iso,
      callingCode: getCountryCallingCode(iso),
    }))
    .sort((a, b) => a.iso.localeCompare(b.iso));
  return cached;
}
