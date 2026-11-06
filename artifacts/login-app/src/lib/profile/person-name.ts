/**
 * Structured person names for signup.
 * Existing profiles that only have full_name stay valid: parts are optional on read.
 * Values are trimmed only — Arabic and other letters are not normalized or stripped.
 */

export const PERSON_NAME_PART_MAX = 80;
export const PERSON_NAME_COMBINED_MAX = 200;

export type PersonNameParts = {
  firstName: string;
  middleName: string;
  lastName: string;
};

export type PersonNameErrorCode = "required" | "tooLong";

export type PersonNameErrors = Partial<
  Record<keyof PersonNameParts | "fullName", PersonNameErrorCode>
>;

export type ProfileNameSource = {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
};

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function composePersonName(
  parts: Partial<PersonNameParts> & { fullName?: string | null },
): string {
  const structured = [parts.firstName, parts.middleName, parts.lastName]
    .map((value) => clean(value))
    .filter(Boolean);
  if (structured.length > 0) return structured.join(" ");
  return clean(parts.fullName);
}

/** New signups require all three parts. Legacy rows may have only full_name. */
export function validatePersonNameParts(parts: PersonNameParts): PersonNameErrors {
  const errors: PersonNameErrors = {};
  const first = clean(parts.firstName);
  const middle = clean(parts.middleName);
  const last = clean(parts.lastName);

  if (!first) errors.firstName = "required";
  else if (first.length > PERSON_NAME_PART_MAX) errors.firstName = "tooLong";

  if (!middle) errors.middleName = "required";
  else if (middle.length > PERSON_NAME_PART_MAX) errors.middleName = "tooLong";

  if (!last) errors.lastName = "required";
  else if (last.length > PERSON_NAME_PART_MAX) errors.lastName = "tooLong";

  const combined = composePersonName({ firstName: first, middleName: middle, lastName: last });
  if (!errors.firstName && !errors.middleName && !errors.lastName && combined.length > PERSON_NAME_COMBINED_MAX) {
    errors.fullName = "tooLong";
  }

  return errors;
}

/**
 * Display name for a stored profile.
 * Structured parts win when any of them is present. Otherwise full_name is used unchanged.
 */
export function displayProfileName(profile: ProfileNameSource | null | undefined): string {
  if (!profile) return "";
  const structured = composePersonName({
    firstName: profile.first_name ?? "",
    middleName: profile.middle_name ?? "",
    lastName: profile.last_name ?? "",
  });
  if (structured) return structured;
  return clean(profile.full_name);
}
