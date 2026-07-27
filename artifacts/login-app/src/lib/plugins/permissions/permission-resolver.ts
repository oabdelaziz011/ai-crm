import type { PluginPermission } from "@/lib/plugins/types";

const IMPLIES: Record<string, string[]> = {
  "customers.write": ["customers.read"],
  "bookings.write": ["bookings.read"],
  "billing.write": ["billing.read"],
};

export function hasPluginPermission(granted: PluginPermission[], required: PluginPermission): boolean {
  if (granted.includes(required)) return true;
  for (const [write, reads] of Object.entries(IMPLIES)) {
    if (required === reads[0] && granted.includes(write as PluginPermission)) return true;
  }
  return false;
}

export function resolveEffectivePermissions(
  requested: PluginPermission[],
  approved: PluginPermission[],
): { granted: PluginPermission[]; denied: PluginPermission[] } {
  const granted = requested.filter((p) => approved.includes(p));
  const denied = requested.filter((p) => !approved.includes(p));
  return { granted, denied };
}

export function validatePermissionApproval(
  requested: PluginPermission[],
  approved: PluginPermission[],
): { valid: boolean; unapproved: PluginPermission[] } {
  const unapproved = requested.filter((p) => !approved.includes(p));
  return { valid: unapproved.length === 0, unapproved };
}
