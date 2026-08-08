/**
 * Platform-wide employee identity — single source of truth projection from `profiles`.
 * Descriptive only. Never used for authorization (RBAC roles control permissions).
 *
 * Future-compatible fields (presence, lastSeen, teams) can be added without
 * changing consumers that only read the core identity shape.
 */
export type EmployeeIdentity = Readonly<{
  id: string;
  userId: string | null;
  fullName: string;
  email: string | null;
  avatarUrl: string | null;
  phone: string | null;
  jobTitle: string | null;
  department: string | null;
  status: "active" | "inactive";
  language: string | null;
  timezone: string | null;
  bio: string | null;
  extensionNumber: string | null;
  /** Reserved for presence / online status (future). */
  presence?: "online" | "away" | "offline" | "working" | null;
  lastSeenAt?: string | null;
}>;

export type EmployeeIdentityLookupKey = string;
