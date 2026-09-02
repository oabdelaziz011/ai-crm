import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { getPasswordSetupCallbackUrl } from "@/lib/auth-redirect";
import { translateAuthErrorMessage } from "@/lib/auth-errors";
import {
  translateProvisionUserErrorMessage,
  readProvisionUserErrorPayload,
} from "@/lib/provision-user-errors";
import {
  CompanyHasNoRolesError,
  RoleAssignmentError,
  assertCompanyHasAssignableRoles,
  validateRoleBelongsToCompany,
  validateUserRoleAssignment,
} from "@/lib/users/role-company-validation";
import { replaceUserRole } from "@/lib/users/replace-user-role";
import { syncUserBranchAssignments } from "@/lib/company/branches/hooks";
import { invalidateBranchQueries } from "@/lib/company/branches/cache";
import { USERS_LIST_PAGE_SIZE } from "@/lib/crm/crm-list-config";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";
import { supabase } from "@/lib/supabase";
import i18n from "@/i18n";

export type ManagedUser = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  preferred_language: string | null;
  timezone: string | null;
  company_id: string | null;
  is_active: boolean;
  is_super_admin: boolean;
  created_at: string | null;
};

export type ManagedUserRole = {
  roleId: string;
  roleName: string | null;
};

export const USERS_MANAGEMENT_KEY = ["users-management"] as const;
export const USERS_LIST_MAX_ROWS = USERS_LIST_PAGE_SIZE * 20;

const PROFILE_LIST_COLUMNS =
  "id, email, full_name, avatar_url, job_title, department, phone, preferred_language, timezone, company_id, is_active, is_super_admin, created_at" as const;

export type ManagedUsersScope = {
  companyId?: string | null;
};

function usersListKey(scope: ManagedUsersScope) {
  return [...USERS_MANAGEMENT_KEY, scope.companyId ?? "all"] as const;
}

async function fetchManagedUsersPage(
  offset: number,
  limit: number,
  scope: ManagedUsersScope,
): Promise<ManagedUser[]> {
  const from = offset;
  const to = offset + limit - 1;
  let query = supabase
    .from("profiles")
    .select(PROFILE_LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (scope.companyId) {
    query = query.eq("company_id", scope.companyId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ManagedUser[];
}

function translateRoleAssignmentError(error: unknown): string {
  if (error instanceof CompanyHasNoRolesError) {
    return i18n.t("users.errors.company_has_no_roles", {
      ns: "common",
      defaultValue: error.message,
    });
  }
  if (error instanceof RoleAssignmentError) {
    return i18n.t(`users.errors.${error.code}`, {
      ns: "common",
      defaultValue: error.message,
    });
  }
  if (error instanceof Error) {
    return error.message;
  }
  return i18n.t("users.errors.provisionFailed", { ns: "common" });
}

async function assignUserRole(
  userId: string,
  roleId: string,
  targetCompanyId?: string | null,
) {
  await validateUserRoleAssignment(userId, roleId, targetCompanyId);
  await replaceUserRole(userId, roleId);
}

export function useManagedUsers(scope: ManagedUsersScope = {}) {
  return useQuery({
    queryKey: [...usersListKey(scope), "bounded", USERS_LIST_MAX_ROWS],
    staleTime: APP_QUERY_STALE_MS,
    queryFn: async (): Promise<ManagedUser[]> => {
      const all: ManagedUser[] = [];
      let offset = 0;
      while (all.length < USERS_LIST_MAX_ROWS) {
        const page = await fetchManagedUsersPage(offset, USERS_LIST_PAGE_SIZE, scope);
        all.push(...page);
        if (page.length < USERS_LIST_PAGE_SIZE) break;
        offset += USERS_LIST_PAGE_SIZE;
      }
      return all;
    },
  });
}

export function useManagedUsersInfinite(scope: ManagedUsersScope = {}, pageSize = USERS_LIST_PAGE_SIZE) {
  return useInfiniteQuery({
    queryKey: [...usersListKey(scope), "infinite", pageSize],
    staleTime: APP_QUERY_STALE_MS,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const rows = await fetchManagedUsersPage(pageParam, pageSize, scope);
      return {
        rows,
        nextOffset: rows.length < pageSize ? null : pageParam + pageSize,
      };
    },
    getNextPageParam: (lastPage, _pages, lastOffset) => {
      if (lastPage.nextOffset == null) return undefined;
      if (lastOffset + pageSize >= USERS_LIST_MAX_ROWS) return undefined;
      return lastPage.nextOffset;
    },
  });
}

export function useManagedUserRoleMap(scope: ManagedUsersScope = {}) {
  return useQuery({
    queryKey: [...usersListKey(scope), "role-map"],
    staleTime: APP_QUERY_STALE_MS,
    queryFn: async (): Promise<Record<string, ManagedUserRole>> => {
      let query = supabase.from("user_roles").select("user_id, role_id, roles(name, company_id)");

      if (scope.companyId) {
        query = query.eq("roles.company_id", scope.companyId);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const map: Record<string, ManagedUserRole> = {};
      for (const row of data ?? []) {
        if (map[row.user_id]) {
          continue;
        }

        const role = row.roles as { name?: string | null; company_id?: string | null } | null;
        map[row.user_id] = {
          roleId: row.role_id,
          roleName: role?.name ?? null,
        };
      }

      return map;
    },
  });
}

type CreateUserInput = {
  email: string;
  fullName: string;
  companyId: string;
  roleId: string;
  isActive: boolean;
  branchIds?: string[];
  jobTitle?: string | null;
  department?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  preferredLanguage?: string | null;
  timezone?: string | null;
};

function invalidateManagedUserCaches(
  qc: ReturnType<typeof useQueryClient>,
  companyId?: string | null,
) {
  void qc.invalidateQueries({ queryKey: USERS_MANAGEMENT_KEY });
  void qc.invalidateQueries({ queryKey: ["rbac", "roles"] });
  void qc.invalidateQueries({ queryKey: ["employee-identity"] });
  void qc.invalidateQueries({ queryKey: ["company-workspace"] });
  void qc.invalidateQueries({ queryKey: ["company-employee-auth-meta"] });
  // Settings → Account Information reads the same employee profile row.
  void qc.invalidateQueries({ queryKey: ["my-profile"] });
  if (companyId) {
    invalidateBranchQueries(qc, companyId);
  }
}

export type CompanyEmployeeAuthMeta = {
  userId: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
};

export function useCompanyEmployeeAuthMeta(companyId: string | null) {
  return useQuery({
    queryKey: ["company-employee-auth-meta", companyId] as const,
    enabled: Boolean(companyId),
    staleTime: APP_QUERY_STALE_MS,
    queryFn: async (): Promise<Record<string, CompanyEmployeeAuthMeta>> => {
      const { data, error } = await supabase.rpc("list_company_employee_auth_meta", {
        p_company_id: companyId,
      });
      if (error) throw new Error(error.message);
      const map: Record<string, CompanyEmployeeAuthMeta> = {};
      for (const row of data ?? []) {
        const userId = String(row.user_id);
        map[userId] = {
          userId,
          lastSignInAt: row.last_sign_in_at ? String(row.last_sign_in_at) : null,
          emailConfirmedAt: row.email_confirmed_at ? String(row.email_confirmed_at) : null,
        };
      }
      return map;
    },
  });
}

export function useCreateManagedUser() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const normalizedEmail = input.email.trim().toLowerCase();

      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (existingProfile?.id) {
        throw new Error(translateAuthErrorMessage("User already exists"));
      }

      try {
        await assertCompanyHasAssignableRoles(input.companyId);
        await validateRoleBelongsToCompany(input.roleId, input.companyId);
      } catch (error) {
        throw new Error(translateRoleAssignmentError(error));
      }

      const { data, error: invokeError } = await supabase.functions.invoke("provision-user", {
        body: {
          email: normalizedEmail,
          fullName: input.fullName,
          companyId: input.companyId,
          roleId: input.roleId,
          isActive: input.isActive,
          jobTitle: input.jobTitle ?? null,
          department: input.department ?? null,
          phone: input.phone ?? null,
          avatarUrl: input.avatarUrl ?? null,
          preferredLanguage: input.preferredLanguage ?? null,
          timezone: input.timezone ?? null,
          redirectTo: getPasswordSetupCallbackUrl(),
        },
      });

      const payload = await readProvisionUserErrorPayload(invokeError, data);

      if (invokeError || payload?.error) {
        throw new Error(translateProvisionUserErrorMessage(invokeError, payload));
      }

      if (!data?.ok) {
        throw new Error(translateProvisionUserErrorMessage(null, { error: "Unable to invite user" }));
      }

      const branchIds = input.branchIds ?? [];
      if (branchIds.length > 0) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", normalizedEmail)
          .maybeSingle();

        if (profile?.id) {
          await syncUserBranchAssignments(profile.id, input.companyId, branchIds);
        }
      }
    },
    onSuccess: async (_data, variables) => {
      invalidateManagedUserCaches(qc, variables.companyId);
    },
  });
}

type UpdateUserInput = {
  id: string;
  full_name?: string;
  company_id?: string | null;
  is_active?: boolean;
  roleId?: string;
  branchIds?: string[];
  job_title?: string | null;
  department?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  preferred_language?: string | null;
  timezone?: string | null;
};

export function useUpdateManagedUser() {
  const qc = useQueryClient();
  const { user, refreshAuthContext } = useAuth();

  return useMutation({
    mutationFn: async (input: UpdateUserInput) => {
      // branchIds / roleId are NOT profile columns — never send them to profiles.update.
      const { id, roleId, branchIds, ...profileValues } = input;

      if (Object.keys(profileValues).length > 0) {
        const { error } = await supabase.from("profiles").update(profileValues).eq("id", id);
        if (error) throw new Error(error.message);
      }

      if (roleId) {
        const targetCompanyId =
          profileValues.company_id !== undefined ? profileValues.company_id : undefined;
        try {
          await assignUserRole(id, roleId, targetCompanyId);
        } catch (error) {
          throw new Error(translateRoleAssignmentError(error));
        }
      }

      if (branchIds !== undefined) {
        const targetCompanyId =
          profileValues.company_id ??
          (await supabase.from("profiles").select("company_id").eq("id", id).maybeSingle()).data
            ?.company_id;
        if (targetCompanyId) {
          await syncUserBranchAssignments(id, targetCompanyId, branchIds);
        }
      }
    },
    onSuccess: async (_data, variables) => {
      invalidateManagedUserCaches(qc, variables.company_id);
      if (variables.roleId && user?.id === variables.id) {
        await refreshAuthContext();
      }
    },
  });
}

export function useResetManagedUserPassword() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: getPasswordSetupCallbackUrl(),
      });
      if (error) throw new Error(translateAuthErrorMessage(error));
    },
  });
}

/** Resend invite / account-setup email for an employee. */
export function useResendManagedUserInvitation() {
  return useMutation({
    mutationFn: async (email: string) => {
      const normalized = email.trim().toLowerCase();
      const redirectTo = getPasswordSetupCallbackUrl();

      const signupResend = await supabase.auth.resend({
        type: "signup",
        email: normalized,
        options: { emailRedirectTo: redirectTo },
      });

      if (!signupResend.error) return;

      const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
        redirectTo,
      });
      if (error) throw new Error(translateAuthErrorMessage(error));
    },
  });
}

/** Removes employee from company (roles, branches, company link) and deactivates. */
export function useRemoveManagedUser() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("remove_company_employee", {
        p_user_id: userId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidateManagedUserCaches(qc);
    },
  });
}
