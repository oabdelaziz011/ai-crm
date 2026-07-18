import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { getAuthRedirectUrl } from "@/lib/auth-redirect";
import type { AuthErrorLike } from "@/lib/auth-errors";
import { supabase } from "@/lib/supabase";
import { shouldSkipAuthContextReload } from "@/lib/auth-password-verify";

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
  signIn: (email: string, password: string) => Promise<{ error: AuthErrorLike | null }>;
  signUp: (email: string, password: string) => Promise<{ error: AuthErrorLike | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  refreshAuthContext: () => Promise<void>;
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
  const loadedUserIdRef = useRef<string | null>(null);

  /**
   * Sequence guard for concurrent `loadAuthContext` calls.
   *
   * Each load captures a monotonic generation at start. After every `await`,
   * the load compares its generation to `loadGenerationRef.current`. If they
   * differ, a newer load has started (or auth was cleared) and this load exits
   * without calling setState.
   *
   * This is intentionally not a mutex: overlapping requests still run in
   * parallel; only the newest completion may commit profile, company, roles,
   * permissions, loading, or loadedUserIdRef.
   */
  const loadGenerationRef = useRef(0);

  const invalidateInFlightAuthLoads = () => {
    loadGenerationRef.current += 1;
  };

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

  const loadAuthContext = async (userId: string | undefined, showLoading = true) => {
    if (!userId) {
      invalidateInFlightAuthLoads();
      clearAuthContext();
      loadedUserIdRef.current = null;
      setIsLoading(false);
      return;
    }

    const generation = ++loadGenerationRef.current;
    const isStale = () => generation !== loadGenerationRef.current;

    if (showLoading && !isStale()) {
      setIsLoading(true);
    }

    try {
      const nextProfile = await loadProfile(userId);
      if (isStale()) {
        return;
      }
      setProfile(nextProfile);

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
      if (isStale()) {
        return;
      }
      setCompany(nextCompany);

      const { data: userRoleRows, error: userRoleError } = await supabase
        .from("user_roles")
        .select("role_id")
        .eq("user_id", userId);

      if (userRoleError) {
        console.warn("Unable to load user role assignments", userRoleError.message);
      }

      const assignedRoleIds = (userRoleRows ?? [])
        .map((row) => row.role_id)
        .filter(Boolean) as string[];

      let nextRoles: RoleRecord[] = [];
      if (assignedRoleIds.length > 0) {
        const { data: roleRows, error: roleError } = await supabase
          .from("roles")
          .select("id, company_id, name, description, is_system")
          .in("id", assignedRoleIds);

        if (roleError) {
          console.warn("Unable to load role metadata", roleError.message);
        } else {
          nextRoles = (roleRows ?? []) as RoleRecord[];
        }
      }
      if (isStale()) {
        return;
      }
      setRoles(nextRoles);

      const permissionIds = new Set<string>();

      if (assignedRoleIds.length > 0) {
        const { data: rolePermissionRows, error: rolePermissionError } = await supabase
          .from("role_permissions")
          .select("permission_id")
          .in("role_id", assignedRoleIds);

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

      if (isStale()) {
        return;
      }
      setPermissions(nextPermissions);
      loadedUserIdRef.current = userId;
    } catch (error) {
      if (isStale()) {
        return;
      }
      console.warn("Unable to load RBAC context", error);
      clearAuthContext();
      loadedUserIdRef.current = null;
    } finally {
      if (!isStale()) {
        setIsLoading(false);
      }
    }
  };

  const handleAuthStateChange = async (event: AuthChangeEvent, nextSession: Session | null) => {
    setSession(nextSession);

    if (event === "SIGNED_OUT" || !nextSession?.user) {
      invalidateInFlightAuthLoads();
      clearAuthContext();
      loadedUserIdRef.current = null;
      setIsLoading(false);
      return;
    }

    const nextUserId = nextSession.user.id;

    if (event === "SIGNED_IN" && shouldSkipAuthContextReload() && loadedUserIdRef.current === nextUserId) {
      loadedUserIdRef.current = nextUserId;
      return;
    }

    const userChanged = loadedUserIdRef.current !== null && loadedUserIdRef.current !== nextUserId;
    const shouldReload =
      event === "INITIAL_SESSION" ||
      event === "TOKEN_REFRESHED" ||
      event === "SIGNED_IN" ||
      event === "USER_UPDATED" ||
      event === "PASSWORD_RECOVERY" ||
      userChanged ||
      loadedUserIdRef.current === null;

    if (!shouldReload) {
      return;
    }

    if (event === "SIGNED_IN" || userChanged) {
      invalidateInFlightAuthLoads();
      clearAuthContext();
    }

    const showLoading =
      event === "INITIAL_SESSION" || event === "SIGNED_IN" || userChanged || loadedUserIdRef.current === null;

    await loadAuthContext(nextUserId, showLoading);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      void handleAuthStateChange(event, nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const result = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return {
      error: result.error
        ? { message: result.error.message, code: result.error.code, status: result.error.status }
        : null,
    };
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getAuthRedirectUrl("/auth/callback"),
      },
    });

    return {
      error: error ? { message: error.message, code: error.code, status: error.status } : null,
      needsEmailConfirmation: Boolean(data.user && !data.session),
    };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    invalidateInFlightAuthLoads();
    clearAuthContext();
    loadedUserIdRef.current = null;
    setSession(null);
    setIsLoading(false);
  };

  const refreshAuthContext = async () => {
    const userId = session?.user?.id;
    if (!userId) {
      return;
    }
    await loadAuthContext(userId, false);
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
        refreshAuthContext,
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
