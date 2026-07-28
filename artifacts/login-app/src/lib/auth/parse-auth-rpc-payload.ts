import type { AuthBootstrapPayload } from "@/lib/auth/load-user-auth-context";
import { normalizeAuthBootstrapProfile } from "@/lib/auth/normalize-auth-bootstrap-profile";

/** Test helper — mirrors load-user-auth-context parseRpcPayload without Supabase. */
export function parseRpcPayloadForTest(raw: unknown): AuthBootstrapPayload {
  const record = (raw ?? {}) as Record<string, unknown>;
  const profile = normalizeAuthBootstrapProfile(record.profile);
  const company = (record.company as AuthBootstrapPayload["company"]) ?? null;
  const roles = Array.isArray(record.roles) ? (record.roles as AuthBootstrapPayload["roles"]) : [];
  const permissions = Array.isArray(record.permissions)
    ? (record.permissions as AuthBootstrapPayload["permissions"])
    : [];
  return { profile, company, roles, permissions };
}
