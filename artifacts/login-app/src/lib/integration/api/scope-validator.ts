import type { ApiScope } from "@/lib/integration/types";

const SCOPE_HIERARCHY: Record<string, string[]> = {
  "customers.write": ["customers.read"],
  "bookings.write": ["bookings.read"],
};

export function hasScope(granted: ApiScope[], required: ApiScope): boolean {
  if (granted.includes(required)) return true;
  for (const [writeScope, readScopes] of Object.entries(SCOPE_HIERARCHY)) {
    if (required === readScopes[0] && granted.includes(writeScope as ApiScope)) return true;
  }
  return false;
}

export function validateScopes(granted: ApiScope[], required: ApiScope[]): { valid: boolean; missing: ApiScope[] } {
  const missing = required.filter((s) => !hasScope(granted, s));
  return { valid: missing.length === 0, missing };
}

export function parseScopeHeader(header: string | undefined): ApiScope[] {
  if (!header) return [];
  return header.split(/[\s,]+/).filter(Boolean) as ApiScope[];
}
