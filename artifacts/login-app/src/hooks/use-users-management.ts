import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { getPasswordSetupCallbackUrl } from "@/lib/auth-redirect";
import { translateAuthErrorMessage } from "@/lib/auth-errors";
import {
  translateProvisionUserErrorMessage,
} from "@/lib/provision-user-errors";
import {
  CompanyHasNoRolesError,
  RoleAssignmentError,
  assertCompanyHasAssignableRoles,
  validateRoleBelongsToCompany,
  validateUserRoleAssignment,
} from "@/lib/users/role-company-validation";
import { replaceUserRole } from "@/lib/users/replace-user-role";
import { supabase } from "@/lib/supabase";
import i18n from "@/i18n";

export type ManagedUser = {
  id: string;
  email: string;
  full_name: string | null;
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

export function useManagedUsers() {
  return useQuery({
    queryKey: USERS_MANAGEMENT_KEY,
    queryFn: async (): Promise<ManagedUser[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, company_id, is_active, is_super_admin, created_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ManagedUser[];
    },
  });
}

export function useManagedUserRoleMap() {
  return useQuery({
    queryKey: [...USERS_MANAGEMENT_KEY, "role-map"],
    queryFn: async (): Promise<Record<string, ManagedUserRole>> => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role_id, roles(name)");

      if (error) throw new Error(error.message);

      const map: Record<string, ManagedUserRole> = {};
      for (const row of data ?? []) {
        if (map[row.user_id]) {
          continue;
        }

        const role = row.roles as { name?: string | null } | null;
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
};

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
          redirectTo: getPasswordSetupCallbackUrl(),
        },
      });

      if (invokeError || data?.error) {
        throw new Error(translateProvisionUserErrorMessage(invokeError, data));
      }

      if (!data?.ok) {
        throw new Error(translateProvisionUserErrorMessage(null, { error: "Unable to invite user" }));
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: USERS_MANAGEMENT_KEY });
      await qc.invalidateQueries({ queryKey: ["rbac", "roles"] });
    },
  });
}

type UpdateUserInput = {
  id: string;
  full_name?: string;
  company_id?: string | null;
  is_active?: boolean;
  roleId?: string;
};

export function useUpdateManagedUser() {
  const qc = useQueryClient();
  const { user, refreshAuthContext } = useAuth();

  return useMutation({
    mutationFn: async (input: UpdateUserInput) => {
      const { id, roleId, ...values } = input;

      if (Object.keys(values).length > 0) {
        const { error } = await supabase.from("profiles").update(values).eq("id", id);
        if (error) throw new Error(error.message);
      }

      if (roleId) {
        const targetCompanyId =
          values.company_id !== undefined
            ? values.company_id
            : undefined;
        try {
          await assignUserRole(id, roleId, targetCompanyId);
        } catch (error) {
          throw new Error(translateRoleAssignmentError(error));
        }
      }
    },
    onSuccess: async (_data, variables) => {
      await qc.invalidateQueries({ queryKey: USERS_MANAGEMENT_KEY });
      await qc.invalidateQueries({ queryKey: ["rbac", "roles"] });
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
