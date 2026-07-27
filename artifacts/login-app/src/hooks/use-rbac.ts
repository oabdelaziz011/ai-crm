import { useCallback, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { supabase } from "@/lib/supabase";

export interface RoleRecord {
  id: string;
  name: string | null;
  description: string | null;
  role_type?: "PLATFORM" | "DEFAULT" | "CUSTOM" | null;
  template_key?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PermissionRecord {
  id: string;
  code: string | null;
  category: string | null;
  module: string | null;
  action: string | null;
  description: string | null;
}

export interface UsePermissionsResult {
  permissions: PermissionRecord[];
  hasPermission: (permissionCode: string) => boolean;
  isSuperAdmin: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  roles: RoleRecord[];
}

export const DEFAULT_RBAC_PERMISSIONS: PermissionRecord[] = [
  { id: "customers.view", code: "customers.view", category: "Customers", module: "Customers", action: "View", description: "View customers" },
  { id: "customers.create", code: "customers.create", category: "Customers", module: "Customers", action: "Create", description: "Create customers" },
  { id: "customers.edit", code: "customers.edit", category: "Customers", module: "Customers", action: "Edit", description: "Edit customers" },
  { id: "customers.delete", code: "customers.delete", category: "Customers", module: "Customers", action: "Delete", description: "Delete customers" },
  { id: "bookings.view", code: "bookings.view", category: "Bookings", module: "Bookings", action: "View", description: "View bookings" },
  { id: "bookings.create", code: "bookings.create", category: "Bookings", module: "Bookings", action: "Create", description: "Create bookings" },
  { id: "bookings.edit", code: "bookings.edit", category: "Bookings", module: "Bookings", action: "Edit", description: "Edit bookings" },
  { id: "bookings.delete", code: "bookings.delete", category: "Bookings", module: "Bookings", action: "Delete", description: "Delete bookings" },
  { id: "invoices.view", code: "invoices.view", category: "Invoices", module: "Invoices", action: "View", description: "View invoices" },
  { id: "invoices.create", code: "invoices.create", category: "Invoices", module: "Invoices", action: "Create", description: "Create invoices" },
  { id: "invoices.edit", code: "invoices.edit", category: "Invoices", module: "Invoices", action: "Edit", description: "Edit invoices" },
  { id: "invoices.delete", code: "invoices.delete", category: "Invoices", module: "Invoices", action: "Delete", description: "Delete invoices" },
  { id: "companies.view", code: "companies.view", category: "Administration", module: "Companies", action: "View", description: "View companies" },
  { id: "companies.create", code: "companies.create", category: "Administration", module: "Companies", action: "Create", description: "Create companies" },
  { id: "companies.edit", code: "companies.edit", category: "Administration", module: "Companies", action: "Edit", description: "Edit companies" },
  { id: "companies.delete", code: "companies.delete", category: "Administration", module: "Companies", action: "Delete", description: "Delete companies" },
  { id: "subscriptions.view", code: "subscriptions.view", category: "Administration", module: "Subscriptions", action: "View", description: "View subscriptions" },
  { id: "subscriptions.edit", code: "subscriptions.edit", category: "Administration", module: "Subscriptions", action: "Edit", description: "Edit subscriptions" },
  { id: "audit_logs.view", code: "audit_logs.view", category: "Administration", module: "Audit Logs", action: "View", description: "View audit logs" },
  { id: "reports.view", code: "reports.view", category: "Reports", module: "Reports", action: "View", description: "View reports" },
  { id: "settings.view", code: "settings.view", category: "Settings", module: "Settings", action: "View", description: "View settings" },
  { id: "settings.edit", code: "settings.edit", category: "Settings", module: "Settings", action: "Edit", description: "Edit settings" },
  { id: "scheduling.view", code: "scheduling.view", category: "Scheduling", module: "Scheduling", action: "View", description: "View scheduling settings" },
  { id: "scheduling.edit", code: "scheduling.edit", category: "Scheduling", module: "Scheduling", action: "Edit", description: "Manage scheduling resources and configuration" },
  { id: "ai_chat.view", code: "ai_chat.view", category: "AI Chat", module: "AI Chat", action: "View", description: "View AI chat" },
  { id: "ai_chat.use", code: "ai_chat.use", category: "AI Chat", module: "AI Chat", action: "Use", description: "Use AI chat" },
  { id: "whatsapp.view", code: "whatsapp.view", category: "WhatsApp Automation", module: "WhatsApp Automation", action: "View", description: "View WhatsApp automation" },
  { id: "whatsapp.run", code: "whatsapp.run", category: "WhatsApp Automation", module: "WhatsApp Automation", action: "Run", description: "Run WhatsApp automation" },
  { id: "users.view", code: "users.view", category: "Administration", module: "Users", action: "View", description: "View users" },
  { id: "users.edit", code: "users.edit", category: "Administration", module: "Users", action: "Edit", description: "Edit users" },
  { id: "roles.view", code: "roles.view", category: "Administration", module: "Roles", action: "View", description: "View roles" },
  { id: "roles.create", code: "roles.create", category: "Administration", module: "Roles", action: "Create", description: "Create roles" },
  { id: "roles.edit", code: "roles.edit", category: "Administration", module: "Roles", action: "Edit", description: "Edit roles" },
  { id: "roles.delete", code: "roles.delete", category: "Administration", module: "Roles", action: "Delete", description: "Delete roles" },
  { id: "permissions.view", code: "permissions.view", category: "Administration", module: "User Permissions", action: "View", description: "View permissions" },
  { id: "permissions.edit", code: "permissions.edit", category: "Administration", module: "User Permissions", action: "Edit", description: "Edit permissions" },
];

/**
 * usePermissions - Consumes RBAC data from AuthContext (single source of truth)
 * No Supabase queries. All data loaded by AuthContext.
 */
export function usePermissions(): UsePermissionsResult {
  const { permissions, roles, isSuperAdmin, isLoading, isRefreshing } = useAuth();

  const hasPermission = useCallback(
    (permissionCode: string) => {
      return isSuperAdmin || permissions.some((p) => p.code === permissionCode);
    },
    [isSuperAdmin, permissions]
  );

  return {
    permissions,
    hasPermission,
    isSuperAdmin,
    isLoading,
    isRefreshing,
    roles,
  };
}

export function useAuthUser() {
  const { user, profile, isLoading, displayName } = useAuth();
  const { permissions, hasPermission, isSuperAdmin, roles } = usePermissions();

  const permissionCodes = useMemo(() => {
    const codes = new Set<string>();
    (permissions ?? []).forEach((permission) => {
      if (permission?.code) codes.add(permission.code);
    });
    if (isSuperAdmin) {
      DEFAULT_RBAC_PERMISSIONS.forEach((permission) => {
        if (permission?.code) codes.add(permission.code);
      });
    }
    return Array.from(codes);
  }, [isSuperAdmin, permissions]);

  return {
    user,
    profile,
    roles,
    permissions,
    isLoading,
    displayName,
    isSuperAdmin,
    permissionCodes,
    hasPermission,
  };
}

export function useHasPermission(permissionCode: string) {
  const { hasPermission } = usePermissions();
  return hasPermission(permissionCode);
}

export function useRoles() {
  return useQuery({
    queryKey: ["rbac", "roles"],
    queryFn: async (): Promise<RoleRecord[]> => {
      const { data, error } = await supabase
        .from("roles")
        .select("id, name, description, role_type, template_key, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) {
        console.warn("Roles table unavailable, using empty state", error.message);
        return [];
      }
      return (data ?? []) as RoleRecord[];
    },
    retry: false,
  });
}

export function usePermissionCatalog() {
  return useQuery({
    queryKey: ["rbac", "permissions-catalog"],
    queryFn: async (): Promise<PermissionRecord[]> => {
      const { data, error } = await supabase
        .from("permissions")
        .select("id, code, category, module, action, description")
        .order("module", { ascending: true });
      if (error) {
        console.warn("Permissions table unavailable, using defaults", error.message);
        return DEFAULT_RBAC_PERMISSIONS;
      }
      return (data ?? DEFAULT_RBAC_PERMISSIONS) as PermissionRecord[];
    },
    retry: false,
  });
}

export async function fetchRolePermissionCodes(roleId: string): Promise<string[]> {
  const { data: rolePermissionRows, error: rolePermissionError } = await supabase
    .from("role_permissions")
    .select("permission_id")
    .eq("role_id", roleId);
  if (rolePermissionError) {
    throw new Error(rolePermissionError.message);
  }

  const permissionIds = (rolePermissionRows ?? [])
    .map((row) => row.permission_id)
    .filter((id): id is string => Boolean(id));
  if (permissionIds.length === 0) {
    return [];
  }

  const { data: permissionRows, error: permissionError } = await supabase
    .from("permissions")
    .select("code")
    .in("id", permissionIds);
  if (permissionError) {
    throw new Error(permissionError.message);
  }

  return (permissionRows ?? [])
    .map((row) => row.code)
    .filter((code): code is string => Boolean(code));
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, description, permissions }: { name: string; description: string; permissions: string[] }) => {
      const { data: roleData, error: roleError } = await supabase.from("roles").insert({ name, description }).select().single();
      if (roleError) throw new Error(roleError.message);

      const { data: permissionRows, error: permissionError } = await supabase.from("permissions").select("id, code").in("code", permissions);
      if (!permissionError && permissionRows) {
        const mappings = permissionRows
          .filter((row) => row?.id)
          .map((row) => ({ role_id: roleData.id, permission_id: row.id }));
        if (mappings.length > 0) {
          await supabase.from("role_permissions").insert(mappings);
        }
      }
      return roleData as RoleRecord;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["rbac", "roles"] });
      await qc.invalidateQueries({ queryKey: ["rbac", "permissions-catalog"] });
    },
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, description, permissions }: { id: string; name: string; description: string; permissions: string[] }) => {
      const { data, error } = await supabase.from("roles").update({ name, description }).eq("id", id).select().single();
      if (error) throw new Error(error.message);

      await supabase.from("role_permissions").delete().eq("role_id", id);
      const { data: permissionRows, error: permissionError } = await supabase.from("permissions").select("id, code").in("code", permissions);
      if (!permissionError && permissionRows) {
        const mappings = permissionRows
          .filter((row) => row?.id)
          .map((row) => ({ role_id: id, permission_id: row.id }));
        if (mappings.length > 0) {
          await supabase.from("role_permissions").insert(mappings);
        }
      }
      return data as RoleRecord;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["rbac", "roles"] });
      await qc.invalidateQueries({ queryKey: ["rbac", "permissions-catalog"] });
    },
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("role_permissions").delete().eq("role_id", id);
      const { error } = await supabase.from("roles").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["rbac", "roles"] });
      await qc.invalidateQueries({ queryKey: ["rbac", "permissions-catalog"] });
    },
  });
}

export function useAssignUserRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, roleIds }: { userId: string; roleIds: string[] }) => {
      const { replaceUserRoles } = await import("@/lib/users/replace-user-role");
      await replaceUserRoles(userId, roleIds);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["rbac", "roles"] });
    },
  });
}

export function useAssignUserPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, permissionCodes }: { userId: string; permissionCodes: string[] }) => {
      await supabase.from("user_permissions").delete().eq("user_id", userId);
      if (permissionCodes.length > 0) {
        const { data: permissionRows, error } = await supabase.from("permissions").select("id, code").in("code", permissionCodes);
        if (!error && permissionRows) {
          const rows = permissionRows.filter((row) => row?.id).map((row) => ({ user_id: userId, permission_id: row.id }));
          if (rows.length > 0) {
            await supabase.from("user_permissions").insert(rows);
          }
        }
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["rbac", "permissions-catalog"] });
    },
  });
}
