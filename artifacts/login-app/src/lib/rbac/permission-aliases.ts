/**
 * Permission code aliases and deprecations.
 * Maps legacy/orphan codes to their canonical enforcement target.
 * Do not create new permission codes — use existing codes only.
 */
export const PERMISSION_ALIASES: Record<string, string> = {
  "users.create": "users.edit",
  "users.delete": "users.edit",
  "ai-chat.view": "ai_chat.view",
  "ai.knowledge.manage": "knowledge.manage",
  "ai.whatsapp.manage": "channels.manage",
  "whatsapp.run": "whatsapp.view",
  "permissions.view": "roles.view",
  "permissions.edit": "roles.edit",
};

/** Deprecated codes kept for backward compatibility; resolved via aliases. */
export const DEPRECATED_PERMISSION_CODES = new Set([
  "ai-chat.view",
  "ai.knowledge.manage",
  "ai.whatsapp.manage",
  "whatsapp.run",
]);

export function resolvePermissionCode(code: string): string {
  return PERMISSION_ALIASES[code] ?? code;
}

export function hasResolvedPermission(
  code: string,
  grantedCodes: ReadonlySet<string> | readonly string[],
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true;
  const granted =
    grantedCodes instanceof Set ? grantedCodes : new Set(grantedCodes);
  const resolved = resolvePermissionCode(code);
  if (granted.has(code) || granted.has(resolved)) return true;
  return false;
}
