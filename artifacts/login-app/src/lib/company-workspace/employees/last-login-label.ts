import { formatDistanceToNow } from "date-fns";
import type { TFunction } from "i18next";
import type { CompanyEmployeeAuthMeta } from "@/hooks/use-users-management";

export type LastLoginKind = "invitation_pending" | "never_signed_in" | "relative";

export function resolveLastLogin(
  meta: CompanyEmployeeAuthMeta | undefined,
  t: TFunction,
): { kind: LastLoginKind; label: string } {
  const lastSignInAt = meta?.lastSignInAt ?? null;
  const emailConfirmedAt = meta?.emailConfirmedAt ?? null;

  if (!lastSignInAt && !emailConfirmedAt) {
    return {
      kind: "invitation_pending",
      label: t("companyWorkspace.employees.invitationPending"),
    };
  }

  if (!lastSignInAt) {
    return {
      kind: "never_signed_in",
      label: t("companyWorkspace.employees.neverSignedIn"),
    };
  }

  try {
    return {
      kind: "relative",
      label: formatDistanceToNow(new Date(lastSignInAt), { addSuffix: true }),
    };
  } catch {
    return {
      kind: "never_signed_in",
      label: t("companyWorkspace.employees.neverSignedIn"),
    };
  }
}
