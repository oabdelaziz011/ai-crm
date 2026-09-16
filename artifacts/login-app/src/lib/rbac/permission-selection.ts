/** Pure selection helpers for the Roles permission matrix. Codes only — never invents permissions. */

export function addPermissionCodes(
  selected: readonly string[],
  codes: readonly string[],
): string[] {
  const next = new Set(selected);
  for (const code of codes) {
    if (code) next.add(code);
  }
  return Array.from(next);
}

export function removePermissionCodes(
  selected: readonly string[],
  codes: readonly string[],
): string[] {
  const remove = new Set(codes.filter(Boolean));
  return selected.filter((code) => !remove.has(code));
}

export function togglePermissionCode(selected: readonly string[], code: string): string[] {
  if (!code) return [...selected];
  if (selected.includes(code)) {
    return selected.filter((item) => item !== code);
  }
  return [...selected, code];
}

export function replaceWithCodes(codes: readonly string[]): string[] {
  return Array.from(new Set(codes.filter(Boolean)));
}
