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

  const loadAuthContext = async (userId: string | undefined) => {
    clearAuthContext();

    if (!userId) {
      setIsLoading(false);
      return;
    }

    try {
      console.log("[AuthContext] loadAuthContext starting for userId:", userId);
      
      // DEBUG: Check session and auth state
      const { data: sessionData } = await supabase.auth.getSession();
      console.log("JWT USER ID =", sessionData.session?.user.id);
      console.log("QUERY USER ID =", userId);
      console.log("[AuthContext] Current session:", {
        user_id: sessionData?.session?.user?.id,
        email: sessionData?.session?.user?.email,
        access_token_prefix: sessionData?.session?.access_token?.substring(0, 20),
        token_type: sessionData?.session?.token_type,
      });

      // DEBUG: Check getUser() result
      const { data: userData, error: userError } = await supabase.auth.getUser();
      console.log(
         "[JWT METADATA]",
           userData.user?.app_metadata
          );

           console.log(
           "[JWT USER_METADATA]",
           userData.user?.user_metadata
        );
      console.log("[AuthContext] getUser() result:", {
        user_id: userData?.user?.id,
        email: userData?.user?.email,
        error: userError?.message,
      });

      // DEBUG: Inspect full profile query with request/response
      console.log("[AuthContext] About to query profiles table with id =", userId);
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, company_id, full_name, is_super_admin")
        .eq("id", userId)
        .maybeSingle();

      console.log("PROFILE DATA =", profileData);
      console.log("PROFILE ERROR =", profileError);

      // DEBUG: Try wildcard to discover actual column names
      console.log("[AuthContext] Attempting wildcard SELECT * to discover actual columns...");
      const { data: wildData, error: wildError } = await supabase
        .from("profiles")
        .select("*")
        .limit(1);
      
      if (wildData && wildData.length > 0) {
        console.log("[AuthContext] ACTUAL columns in profiles table:", Object.keys(wildData[0]));
      }
      if (wildError) {
        console.log("[AuthContext] Wildcard SELECT failed:", wildError.message);
      }
      
      if (profileError) {
        console.warn("Unable to load profile", profileError.message);
      }

      const nextProfile = (profileData as ProfileRecord | null) ?? null;
      console.log("[AuthContext] Profile loaded:", nextProfile);
       console.log(
       "PROFILE SUPER ADMIN =",
        nextProfile?.is_super_admin
         );
      setProfile(nextProfile);

      // Load company if company_id exists
      let nextCompany: CompanyRecord | null = null;
      if (nextProfile?.company_id) {
        const { data: companyData, error: companyError } = await supabase
          .from("companies")
          .select("id, name, logo_url, status")
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
        console.log("[AuthContext] user_roles query returned:", userRoleRows);
        const roleIds = (userRoleRows ?? [])
          .map((row) => row.role_id)
          .filter(Boolean) as string[];
        console.log("[AuthContext] roleIds extracted:", roleIds);

        if (roleIds.length > 0) {
          const { data: roleRows, error: roleError } = await supabase
            .from("roles")
            .select("id, company_id, name, description, is_system")
            .in("id", roleIds);

          if (roleError) {
            console.warn("Unable to load roles", roleError.message);
          } else {
            console.log("[AuthContext] Roles loaded:", roleRows);
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
      console.log("[AuthContext] permissionIdList:", permissionIdList);
      if (permissionIdList.length > 0) {
        const { data: permissionRows, error: permissionError } = await supabase
          .from("permissions")
          .select("id, category, module, action, code, description")
          .in("id", permissionIdList);

        if (permissionError) {
          console.warn("Unable to load permissions", permissionError.message);
        } else {
          console.log("[AuthContext] Permissions loaded:", permissionRows);
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
      console.log("[AuthContext.useEffect] Initializing session...");
      const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();
      console.log("[AuthContext.useEffect] getSession() returned:", {
        has_session: !!initialSession,
        user_id: initialSession?.user?.id,
        email: initialSession?.user?.email,
        error: sessionError?.message,
      });
      
      setSession(initialSession);
      if (initialSession?.user) {
        console.log("[AuthContext.useEffect] Session found, loading auth context for user:", initialSession.user.id);
        await loadAuthContext(initialSession.user.id);
      } else {
        console.log("[AuthContext.useEffect] No session found, clearing context");
        clearAuthContext();
        setIsLoading(false);
      }
    };

    void initializeSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      console.log("[AuthContext.onAuthStateChange] Event:", _event, "Has session:", !!nextSession, "User ID:", nextSession?.user?.id);
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

  console.log("SIGN IN RESULT =", result);

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
