import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface ProfileRecord {
  id: string;
  company_id: string | null;
  full_name: string | null;
  is_super_admin: boolean;
}

interface CompanyRecord {
  id: string;
  name: string | null;
  logo_url: string | null;
  status: string | null;
  subscription_status: string | null;
  billing_cycle: string | null;
  subscription_expires_at: string | null;
  created_at?: string;
  updated_at?: string;
}

interface RoleRecord {
  id: string;
  company_id: string;
  name: string | null;
  description: string | null;
  is_system: boolean | null;
  created_at?: string;
  updated_at?: string;
}

interface PermissionRecord {
  id: string;
  category: string | null;
  module: string | null;
  action: string | null;
  code: string | null;
  description: string | null;
  created_at?: string;
  updated_at?: string;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: ProfileRecord | null;
  company: CompanyRecord | null;
  roles: RoleRecord[];
  permissions: PermissionRecord[];
  isSuperAdmin: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  displayName: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [company, setCompany] = useState<CompanyRecord | null>(null);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const clearAuthContext = () => {
    setProfile(null);
    setCompany(null);
    setRoles([]);
    setPermissions([]);
  };

  const loadProfile = async (userId: string): Promise<ProfileRecord | null> => {
    const profileColumns = "id, company_id, full_name, is_super_admin";

    const byId = await supabase
      .from("profiles")
      .select(profileColumns)
      .eq("id", userId)
      .maybeSingle();

    if (!byId.error) {
      return (byId.data as ProfileRecord | null) ?? null;
    }

    const byUserId = await supabase
      .from("profiles")
      .select(profileColumns)
      .eq("user_id", userId)
      .maybeSingle();

    if (!byUserId.error) {
      return (byUserId.data as ProfileRecord | null) ?? null;
    }

    throw byUserId.error;
  };

  const loadAuthContext = async (userId: string | undefined) => {
    clearAuthContext();

    if (!userId) {
      setIsLoading(false);
      return;
    }

    try {
      const nextProfile = await loadProfile(userId);
      setProfile(nextProfile);

      // Load company if company_id exists
      let nextCompany: CompanyRecord | null = null;
      if (nextProfile?.company_id) {
        const { data: companyData, error: companyError } = await supabase
          .from("companies")
          .select("id, name, logo_url, status, subscription_status, billing_cycle, subscription_expires_at")
          .eq("id", nextProfile.company_id)
          .maybeSingle();
        
        if (!companyError && companyData) {
          nextCompany = companyData as CompanyRecord;
        }
      }
      setCompany(nextCompany);

      let nextRoles: RoleRecord[] = [];
      const { data: userRoleRows, error: userRoleError } = await supabase
        .from("user_roles")
        .select("role_id")
        .eq("user_id", userId);

      if (userRoleError) {
        console.warn("Unable to load user roles", userRoleError.message);
      } else {
        const roleIds = (userRoleRows ?? [])
          .map((row) => row.role_id)
          .filter(Boolean) as string[];

        if (roleIds.length > 0) {
          const { data: roleRows, error: roleError } = await supabase
            .from("roles")
            .select("id, company_id, name, description, is_system")
            .in("id", roleIds);

          if (roleError) {
            console.warn("Unable to load roles", roleError.message);
          } else {
            nextRoles = (roleRows ?? []) as RoleRecord[];
          }
        }
      }
      setRoles(nextRoles);

      const roleIds = nextRoles.map((role) => role.id);
      const permissionIds = new Set<string>();

      if (roleIds.length > 0) {
        const { data: rolePermissionRows, error: rolePermissionError } = await supabase
          .from("role_permissions")
          .select("permission_id")
          .in("role_id", roleIds);

        if (rolePermissionError) {
          console.warn("Unable to load role permissions", rolePermissionError.message);
        } else {
          (rolePermissionRows ?? []).forEach((row) => {
            if (row.permission_id) {
              permissionIds.add(row.permission_id);
            }
          });
        }
      }

      const { data: userPermissionRows, error: userPermissionError } = await supabase
        .from("user_permissions")
        .select("permission_id")
        .eq("user_id", userId);

      if (userPermissionError) {
        console.warn("Unable to load direct user permissions", userPermissionError.message);
      } else {
        (userPermissionRows ?? []).forEach((row) => {
          if (row.permission_id) {
            permissionIds.add(row.permission_id);
          }
        });
      }

      let nextPermissions: PermissionRecord[] = [];
      const permissionIdList = Array.from(permissionIds);
      if (permissionIdList.length > 0) {
        const { data: permissionRows, error: permissionError } = await supabase
          .from("permissions")
          .select("id, category, module, action, code, description")
          .in("id", permissionIdList);

        if (permissionError) {
          console.warn("Unable to load permissions", permissionError.message);
        } else {
          nextPermissions = (permissionRows ?? []) as PermissionRecord[];
        }
      }

      setPermissions(nextPermissions);
    } catch (error) {
      console.warn("Unable to load RBAC context", error);
      clearAuthContext();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const initializeSession = async () => {
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      
      setSession(initialSession);
      if (initialSession?.user) {
        await loadAuthContext(initialSession.user.id);
      } else {
        clearAuthContext();
        setIsLoading(false);
      }
    };

    void initializeSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        setIsLoading(true);
        await loadAuthContext(nextSession.user.id);
      } else {
        clearAuthContext();
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

const signIn = async (email: string, password: string) => {
  const result = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  return {
    error: result.error?.message ?? null,
  };
};
  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    clearAuthContext();
    setSession(null);
    setIsLoading(false);
  };

  const displayName = profile?.full_name || session?.user?.email?.split("@")[0] || "User";

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        company,
        roles,
        permissions,
        isSuperAdmin: profile?.is_super_admin === true,
        isLoading,
        signIn,
        signUp,
        signOut,
        displayName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
