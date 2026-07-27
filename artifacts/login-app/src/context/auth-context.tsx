import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { getAuthRedirectUrl } from "@/lib/auth-redirect";
import type { AuthErrorLike } from "@/lib/auth-errors";
import {
  authPerfReloadEnd,
  authPerfReloadError,
  authPerfReloadStart,
  authPerfRender,
  authPerfTokenRefreshed,
  authPerfTokenRefreshSkipped,
} from "@/lib/auth/auth-perf";
import { supabase } from "@/lib/supabase";
import { shouldSkipAuthContextReload } from "@/lib/auth-password-verify";
import {
  arraysEqualById,
  createAuthIdentitySnapshot,
  isAuthUserVisibleEqual,
  permissionsEqual,
  shouldSkipTokenRefreshReload,
  type AuthIdentitySnapshot,
} from "@/context/auth-identity";
import { fetchUserAuthContext } from "@/lib/auth/load-user-auth-context";
import { wbDebug } from "@/workflow-builder/debug/wb-runtime-debug";

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

type LoadAuthMode = "bootstrap" | "background";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: ProfileRecord | null;
  company: CompanyRecord | null;
  roles: RoleRecord[];
  permissions: PermissionRecord[];
  isSuperAdmin: boolean;
  /** Blocks the app shell — only true during INITIAL_SESSION bootstrap. */
  isLoading: boolean;
  /** Silent RBAC reload — never blocks navigation or replaces page content. */
  isRefreshing: boolean;
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadedUserIdRef = useRef<string | null>(null);
  const loadedIdentityRef = useRef<AuthIdentitySnapshot | null>(null);
  const latestSessionRef = useRef<Session | null>(null);
  const loadGenerationRef = useRef(0);
  const bootstrapCompleteRef = useRef(false);

  /** Always-current identity for the auth listener (avoids stale closures). */
  const identityRef = useRef({
    profile: null as ProfileRecord | null,
    roles: [] as RoleRecord[],
  });

  useEffect(() => {
    identityRef.current = { profile, roles };
  }, [profile, roles]);

  const invalidateInFlightAuthLoads = () => {
    loadGenerationRef.current += 1;
  };

  const clearAuthContext = () => {
    setProfile(null);
    setCompany(null);
    setRoles([]);
    setPermissions([]);
    loadedIdentityRef.current = null;
    identityRef.current = { profile: null, roles: [] };
  };

  const loadAuthContext = async (
    userId: string | undefined,
    mode: LoadAuthMode,
    trigger: AuthChangeEvent | "manual" = "INITIAL_SESSION",
  ) => {
    if (!userId) {
      invalidateInFlightAuthLoads();
      clearAuthContext();
      loadedUserIdRef.current = null;
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const generation = ++loadGenerationRef.current;
    const isStale = () => generation !== loadGenerationRef.current;

    authPerfReloadStart(trigger, mode);

    if (!isStale()) {
      if (mode === "bootstrap") {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
    }

    try {
      const { profile: nextProfile, company: nextCompany, roles: nextRoles, permissions: nextPermissions } =
        await fetchUserAuthContext(userId);
      if (isStale()) return;

      setProfile((current) => {
        if (
          current?.id === nextProfile?.id
          && current?.company_id === nextProfile?.company_id
          && current?.full_name === nextProfile?.full_name
          && current?.is_super_admin === nextProfile?.is_super_admin
        ) {
          return current;
        }
        return nextProfile;
      });

      if (isStale()) return;

      setCompany((current) => {
        if (
          current?.id === nextCompany?.id
          && current?.name === nextCompany?.name
          && current?.status === nextCompany?.status
          && current?.subscription_status === nextCompany?.subscription_status
        ) {
          return current;
        }
        return nextCompany;
      });

      if (isStale()) return;

      setRoles((current) => (arraysEqualById(current, nextRoles) ? current : nextRoles));

      if (isStale()) return;

      setPermissions((current) => (permissionsEqual(current, nextPermissions) ? current : nextPermissions));
      loadedUserIdRef.current = userId;
      loadedIdentityRef.current = createAuthIdentitySnapshot(
        userId,
        nextProfile?.company_id ?? null,
        nextRoles,
      );

      if (mode === "bootstrap") {
        bootstrapCompleteRef.current = true;
      }
    } catch (error) {
      if (isStale()) return;

      const message = error instanceof Error ? error.message : String(error);
      authPerfReloadError(trigger, mode, message);
      console.warn("Unable to load RBAC context", error);

      if (mode === "bootstrap") {
        clearAuthContext();
        loadedUserIdRef.current = null;
      }
    } finally {
      if (!isStale()) {
        if (mode === "bootstrap") {
          setIsLoading(false);
        } else {
          setIsRefreshing(false);
        }
        authPerfReloadEnd(trigger, mode);
      }
    }
  };

  const commitSession = (event: AuthChangeEvent, nextSession: Session | null) => {
    latestSessionRef.current = nextSession;

    setSession((current) => {
      if (event === "TOKEN_REFRESHED" && isAuthUserVisibleEqual(current, nextSession)) {
        wbDebug("auth session preserved", { event, reason: "token-only refresh" });
        return current;
      }
      return nextSession;
    });
  };

  useEffect(() => {
    const handleAuthStateChange = async (event: AuthChangeEvent, nextSession: Session | null) => {
      if (event === "TOKEN_REFRESHED") {
        authPerfTokenRefreshed(nextSession?.user?.id ?? null);
        wbDebug("TOKEN_REFRESHED", { userId: nextSession?.user?.id ?? null });
      }

      wbDebug("auth state change", { event, userId: nextSession?.user?.id ?? null });
      commitSession(event, nextSession);

      if (event === "SIGNED_OUT" || !nextSession?.user) {
        invalidateInFlightAuthLoads();
        clearAuthContext();
        loadedUserIdRef.current = null;
        bootstrapCompleteRef.current = false;
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      const nextUserId = nextSession.user.id;
      const { profile: currentProfile, roles: currentRoles } = identityRef.current;

      if (
        event === "TOKEN_REFRESHED"
        && shouldSkipTokenRefreshReload({
          loadedUserId: loadedUserIdRef.current,
          nextUserId,
          hasProfile: currentProfile !== null,
          loadedIdentity: loadedIdentityRef.current,
          profileCompanyId: currentProfile?.company_id ?? null,
          roles: currentRoles,
        })
      ) {
        authPerfTokenRefreshSkipped(nextUserId, "identity unchanged");
        wbDebug("auth state change SKIP reload", { event, reason: "token refresh identity unchanged" });
        return;
      }

      if (event === "TOKEN_REFRESHED") {
        wbDebug("auth state change RELOAD", { event, mode: "background", reason: "token refresh identity changed" });
        await loadAuthContext(nextUserId, "background", event);
        return;
      }

      if (event === "SIGNED_IN" && shouldSkipAuthContextReload() && loadedUserIdRef.current === nextUserId) {
        loadedUserIdRef.current = nextUserId;
        return;
      }

      const userChanged = loadedUserIdRef.current !== null && loadedUserIdRef.current !== nextUserId;
      const shouldReload =
        event === "INITIAL_SESSION"
        || event === "SIGNED_IN"
        || event === "USER_UPDATED"
        || event === "PASSWORD_RECOVERY"
        || userChanged
        || loadedUserIdRef.current === null;

      if (!shouldReload) {
        wbDebug("auth state change SKIP reload", { event });
        return;
      }

      const mode: LoadAuthMode =
        event === "INITIAL_SESSION" ? "bootstrap" : "background";

      wbDebug("auth state change RELOAD", { event, mode });

      if (event === "SIGNED_IN" || userChanged) {
        invalidateInFlightAuthLoads();
        if (mode === "bootstrap") {
          clearAuthContext();
        }
      }

      await loadAuthContext(nextUserId, mode, event);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      void handleAuthStateChange(event, nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await supabase.auth.signInWithPassword({ email, password });
    return {
      error: result.error
        ? { message: result.error.message, code: result.error.code, status: result.error.status }
        : null,
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
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
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    invalidateInFlightAuthLoads();
    clearAuthContext();
    loadedUserIdRef.current = null;
    latestSessionRef.current = null;
    bootstrapCompleteRef.current = false;
    setSession(null);
    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  const refreshAuthContext = useCallback(async () => {
    const userId = latestSessionRef.current?.user?.id ?? session?.user?.id;
    if (!userId) return;
    await loadAuthContext(userId, "background", "manual");
  }, [session?.user?.id]);

  const displayName = profile?.full_name || session?.user?.email?.split("@")[0] || "User";

  const contextValue = useMemo<AuthContextType>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      company,
      roles,
      permissions,
      isSuperAdmin: profile?.is_super_admin === true,
      isLoading,
      isRefreshing,
      signIn,
      signUp,
      signOut,
      refreshAuthContext,
      displayName,
    }),
    [
      session,
      profile,
      company,
      roles,
      permissions,
      isLoading,
      isRefreshing,
      signIn,
      signUp,
      signOut,
      refreshAuthContext,
      displayName,
    ],
  );

  useEffect(() => {
    authPerfRender("AuthProvider");
  });

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
