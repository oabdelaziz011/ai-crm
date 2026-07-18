import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import {
  getAuthCallbackNextPath,
  getAuthTypeFromUrl,
  persistAuthCallbackNextPath,
  rememberPasswordSetupIntent,
} from "@/lib/auth-redirect";
import { supabase } from "@/lib/supabase";

type AuthSessionResult = {
  session: Session | null;
  event: AuthChangeEvent | null;
  error: Error | null;
};

function clearAuthParamsFromUrl(): void {
  if (typeof window === "undefined") {
    return;
  }

  const cleanUrl = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState({}, document.title, cleanUrl);
}

async function establishSessionFromUrl(): Promise<AuthSessionResult> {
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  const code = params.get("code");
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return { session: null, event: null, error };
    }
    clearAuthParamsFromUrl();
    return { session: data.session, event: "SIGNED_IN", error: null };
  }

  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      return { session: null, event: null, error };
    }
    clearAuthParamsFromUrl();
    return { session: data.session, event: "SIGNED_IN", error: null };
  }

  const { data, error } = await supabase.auth.getSession();
  return {
    session: data.session,
    event: data.session ? "INITIAL_SESSION" : null,
    error: error ?? null,
  };
}

export async function completeAuthCallbackRoute(): Promise<{
  session: Session | null;
  event: AuthChangeEvent | null;
  error: Error | null;
  nextPath: string;
}> {
  const params = new URLSearchParams(window.location.search);
  const queryNext = params.get("next");
  if (queryNext?.startsWith("/")) {
    persistAuthCallbackNextPath(queryNext);
  }

  const nextPath = getAuthCallbackNextPath();
  const result = await establishSessionFromUrl();

  if (result.session) {
    const authType = getAuthTypeFromUrl();
    if (
      nextPath === "/reset-password" ||
      result.event === "PASSWORD_RECOVERY" ||
      authType === "recovery" ||
      authType === "invite"
    ) {
      rememberPasswordSetupIntent();
    }
  }

  return {
    ...result,
    nextPath,
  };
}

export async function waitForRecoverySession(): Promise<AuthSessionResult> {
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  if (params.get("code") || (hashParams.get("access_token") && hashParams.get("refresh_token"))) {
    return establishSessionFromUrl();
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    return { session: null, event: null, error };
  }

  if (data.session) {
    return { session: data.session, event: "INITIAL_SESSION", error: null };
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = (result: AuthSessionResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      subscription.unsubscribe();
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ session: null, event: null, error: null });
    }, 8_000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        finish({ session, event, error: null });
      }
    });
  });
}
