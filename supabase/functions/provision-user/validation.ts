export const PROVISION_REJECTION = {
  MISSING_USERS_EDIT: "missing_users_edit",
  CALLER_NO_COMPANY: "caller_missing_company",
  MISSING_COMPANY_ID: "missing_company_id",
  COMPANY_ID_MISMATCH: "company_id_mismatch",
  ROLE_NOT_FOUND: "role_not_found",
  ROLE_TENANT_MISMATCH: "role_tenant_mismatch",
  TARGET_USER_TENANT_MISMATCH: "target_user_tenant_mismatch",
  TARGET_IS_SUPER_ADMIN: "target_is_super_admin",
  PLATFORM_ROLE_FORBIDDEN: "platform_role_forbidden",
  COMPANY_HAS_NO_ROLES: "company_has_no_roles",
} as const;

export type ProvisionRole = {
  id: string;
  company_id: string | null;
  is_system: boolean;
  role_type?: string | null;
};

export type ProvisionTargetProfile = {
  id: string;
  company_id: string | null;
  is_super_admin: boolean;
};

export type ProvisionValidationInput = {
  callerUserId: string;
  callerCompanyId: string | null;
  isSuperAdmin: boolean;
  hasUsersEdit: boolean;
  requestedCompanyId: string | null;
  requestedRoleId: string | null;
  role: ProvisionRole | null;
  existingTargetProfile: ProvisionTargetProfile | null;
  companyTenantRoleCount?: number;
};

export type ProvisionValidationSuccess = {
  ok: true;
  effectiveCompanyId: string;
};

export type ProvisionValidationFailure = {
  ok: false;
  auditReason: string;
};

export type ProvisionValidationResult = ProvisionValidationSuccess | ProvisionValidationFailure;

function reject(auditReason: string): ProvisionValidationFailure {
  return { ok: false, auditReason };
}

/**
 * Tenant-safe authorization for provision-user.
 * Non–super-admins always provision into their own company; client companyId is a hint only.
 */
export function validateProvisionRequest(
  input: ProvisionValidationInput,
): ProvisionValidationResult {
  if (!input.hasUsersEdit) {
    return reject(PROVISION_REJECTION.MISSING_USERS_EDIT);
  }

  if (!input.requestedRoleId) {
    return reject(PROVISION_REJECTION.ROLE_NOT_FOUND);
  }

  if (!input.role) {
    return reject(PROVISION_REJECTION.ROLE_NOT_FOUND);
  }

  let effectiveCompanyId: string;

  if (input.isSuperAdmin) {
    if (!input.requestedCompanyId) {
      return reject(PROVISION_REJECTION.MISSING_COMPANY_ID);
    }
    effectiveCompanyId = input.requestedCompanyId;
  } else {
    if (!input.callerCompanyId) {
      return reject(PROVISION_REJECTION.CALLER_NO_COMPANY);
    }
    effectiveCompanyId = input.callerCompanyId;

    if (input.requestedCompanyId && input.requestedCompanyId !== input.callerCompanyId) {
      return reject(PROVISION_REJECTION.COMPANY_ID_MISMATCH);
    }
  }

  if (input.existingTargetProfile) {
    if (input.existingTargetProfile.is_super_admin && !input.isSuperAdmin) {
      return reject(PROVISION_REJECTION.TARGET_IS_SUPER_ADMIN);
    }

    const targetCompanyId = input.existingTargetProfile.company_id;
    if (targetCompanyId && targetCompanyId !== effectiveCompanyId) {
      return reject(PROVISION_REJECTION.TARGET_USER_TENANT_MISMATCH);
    }
  }

  if (typeof input.companyTenantRoleCount === "number" && input.companyTenantRoleCount === 0) {
    return reject(PROVISION_REJECTION.COMPANY_HAS_NO_ROLES);
  }

  if (input.role.role_type === "PLATFORM") {
    return reject(PROVISION_REJECTION.PLATFORM_ROLE_FORBIDDEN);
  }

  if (!input.role.company_id) {
    return reject(PROVISION_REJECTION.PLATFORM_ROLE_FORBIDDEN);
  }

  if (input.role.company_id !== effectiveCompanyId) {
    return reject(PROVISION_REJECTION.ROLE_TENANT_MISMATCH);
  }

  return { ok: true, effectiveCompanyId };
}
