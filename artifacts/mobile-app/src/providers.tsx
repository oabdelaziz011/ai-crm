import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, I18nManager, useColorScheme, View, Text } from "react-native";
import { reloadAppAsync } from "expo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as Network from "expo-network";
import * as SecureStore from "expo-secure-store";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chunkedStore } from "./auth/secure-chunk";
import {
  requestPasswordReset,
  signInToInstance,
  signOutMobileSession,
  type KeyValueStore,
  type MobileSession,
} from "./auth/sign-in";
import { readMobileConfig, type MobilePublicConfig } from "./lib/config";
import { restoreMobileSession, startupDirectionPlan, storedLanguage, withDeadline, STARTUP_DEADLINE_MS, readPendingDirection } from "./lib/startup";
import { textDirection, translate, type AppLanguage, type MessageKey } from "./i18n/catalog";
import { LANGUAGE_STORAGE_KEY, DIRECTION_RELOAD_KEY, languageChangePlan, storageKeysRemovedOnSignOut } from "./i18n/direction";
import { localizeAuthMessage } from "./i18n/present";
import { darkPalette, lightPalette, type Palette } from "./theme/palette";

type ThemeChoice = "system" | "light" | "dark";

type SessionContextValue = {
  booting: boolean;
  bootError: "startup_failed" | null;
  configError: "missing_config" | "privileged_key" | null;
  session: MobileSession | null;
  supabase: SupabaseClient | null;
  offline: boolean;
  language: AppLanguage;
  palette: Palette;
  theme: ThemeChoice;
  t: (key: MessageKey) => string;
  direction: "rtl" | "ltr";
  directionNotice: string | null;
  signIn: (input: { instanceUrl: string; email: string; password: string; remember: boolean }) => Promise<{ ok: true } | { ok: false; message: string }>;
  recover: (input: { instanceUrl: string; email: string }) => Promise<{ ok: true } | { ok: false; message: string }>;
  signOut: () => Promise<void>;
  setLanguage: (language: AppLanguage) => void;
  retryBoot: () => void;
  setTheme: (theme: ThemeChoice) => void;
  accessToken: () => Promise<string | null>;
  instanceHostname: string | null;
  apiUrl: string | null;
};

const SessionContext = createContext<SessionContextValue | null>(null);
const queryClient = new QueryClient();

function secureBackend(): KeyValueStore {
  return {
    async getItem(key) {
      return SecureStore.getItemAsync(key);
    },
    async setItem(key, value) {
      await SecureStore.setItemAsync(key, value);
    },
    async removeItem(key) {
      await SecureStore.deleteItemAsync(key);
    },
  };
}

export function AppProviders({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const store = useMemo(() => chunkedStore(secureBackend()), []);
  const [language, setLanguageState] = useState<AppLanguage>("en");
  const [theme, setThemeState] = useState<ThemeChoice>("system");
  const [offline, setOffline] = useState(false);
  const [booting, setBooting] = useState(true);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [bootError, setBootError] = useState<SessionContextValue["bootError"]>(null);
  const [configError, setConfigError] = useState<SessionContextValue["configError"]>(null);
  const [config, setConfig] = useState<MobilePublicConfig | null>(null);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<MobileSession | null>(null);
  const [instanceHostname, setInstanceHostname] = useState<string | null>(null);
  const [directionNotice, setDirectionNotice] = useState<string | null>(null);
  const languageRequest = useRef(0);

  useEffect(() => {
    const extra = Constants.expoConfig?.extra as {
      apiUrl?: string;
      supabaseUrl?: string;
      supabasePublishableKey?: string;
    } | undefined;
    const read = readMobileConfig(extra);
    if (!read.ok) {
      setConfigError(read.code);
      setBooting(false);
      return;
    }
    setConfig(read.config);
    const client = createClient(read.config.supabaseUrl, read.config.supabasePublishableKey, {
      auth: {
        storage: store,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    setSupabase(client);
    let cancelled = false;
    void (async () => {
      try {
        const [storedLanguageValue, storedTheme, pendingValue] = await withDeadline(Promise.all([
          store.getItem(LANGUAGE_STORAGE_KEY),
          store.getItem("valueor.mobile.theme"),
          store.getItem(DIRECTION_RELOAD_KEY),
        ]), STARTUP_DEADLINE_MS);
        const selected = storedLanguage(storedLanguageValue);
        if (!cancelled) setLanguageState(selected);
        const directionPlan = startupDirectionPlan({
          language: selected,
          isRTL: I18nManager.isRTL,
          pendingReload: readPendingDirection(pendingValue),
        });
        I18nManager.allowRTL(true);
        if (directionPlan.forceRTL != null) I18nManager.forceRTL(directionPlan.forceRTL);
        if (directionPlan.clearPending) {
          await withDeadline(store.removeItem(DIRECTION_RELOAD_KEY), STARTUP_DEADLINE_MS);
        }
        if (!cancelled && (storedTheme === "system" || storedTheme === "light" || storedTheme === "dark")) {
          setThemeState(storedTheme);
        }
      } catch {
        if (!cancelled) setLanguageState("en");
      }
      try {
        const restored = await withDeadline(restoreMobileSession<MobileSession>({
          readAccessToken: async () => (await client.auth.getSession()).data.session?.access_token ?? null,
          readHostname: () => store.getItem("valueor.mobile.instance"),
          loadSession: async ({ accessToken, hostname }) => {
            try {
              const response = await fetch(`${read.config.apiUrl}/api/mobile/session`, {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "X-ValueOR-Instance": hostname,
                  Accept: "application/json",
                },
                signal: AbortSignal.timeout(STARTUP_DEADLINE_MS),
              });
              if (response.status === 401 || response.status === 403) return { ok: false, failure: "auth" };
              if (!response.ok) return { ok: false, failure: "unavailable" };
              return { ok: true, session: await response.json() as MobileSession };
            } catch {
              return { ok: false, failure: "unavailable" };
            }
          },
          signOut: async () => {
            await client.auth.signOut();
          },
          clearHostname: () => store.removeItem("valueor.mobile.instance"),
        }), STARTUP_DEADLINE_MS);
        if (cancelled) return;
        if (restored.outcome === "unavailable") {
          setSession(null);
          setInstanceHostname(restored.hostname);
          setBootError("startup_failed");
        } else {
          setSession(restored.outcome === "restored" ? restored.session : null);
          setInstanceHostname(restored.outcome === "restored" ? restored.hostname : null);
          setBootError(null);
        }
      } catch {
        if (!cancelled) {
          setSession(null);
          setInstanceHostname(null);
          setBootError("startup_failed");
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, bootAttempt]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void Network.getNetworkStateAsync().then((state) => {
        if (!cancelled) setOffline(state.isConnected === false);
      }).catch(() => undefined);
    };
    refresh();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") refresh();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const palette = theme === "dark" || (theme === "system" && system === "dark") ? darkPalette : lightPalette;
  const direction = textDirection(language);

  const value = useMemo<SessionContextValue>(() => ({
    booting,
    bootError,
    configError,
    session,
    supabase,
    offline,
    language,
    palette,
    theme,
    direction,
    directionNotice,
    instanceHostname,
    apiUrl: config?.apiUrl ?? null,
    t: (key) => translate(language, key),
    setLanguage(next) {
      const request = languageRequest.current + 1;
      languageRequest.current = request;
      setLanguageState(next);
      setDirectionNotice(null);
      void (async () => {
        let persisted = true;
        try {
          await store.setItem(LANGUAGE_STORAGE_KEY, next);
        } catch {
          persisted = false;
        }
        if (languageRequest.current !== request) return;
        if (!persisted) {
          setDirectionNotice(translate(next, "languageSaveFailed"));
          return;
        }
        const pending = readPendingDirection(await store.getItem(DIRECTION_RELOAD_KEY));
        if (languageRequest.current !== request) return;
        const directionPlan = languageChangePlan({
          current: language,
          next,
          isRTL: I18nManager.isRTL,
          pendingReload: pending,
          persisted: true,
        });
        if (directionPlan.clearPending) await store.removeItem(DIRECTION_RELOAD_KEY).catch(() => undefined);
        if (!directionPlan.reload || directionPlan.forceRTL == null || !directionPlan.persistPending) return;
        try {
          await store.setItem(DIRECTION_RELOAD_KEY, directionPlan.persistPending);
        } catch {
          if (languageRequest.current === request) setDirectionNotice(translate(next, "languageSaveFailed"));
          return;
        }
        if (languageRequest.current !== request) return;
        I18nManager.allowRTL(true);
        I18nManager.forceRTL(directionPlan.forceRTL);
        setDirectionNotice(translate(next, "directionReload"));
        try {
          await Promise.race([
            reloadAppAsync("locale-direction"),
            new Promise((resolve) => setTimeout(resolve, 4000)),
          ]);
        } catch {
          // The new language stays on screen. The session and workspace are untouched.
        }
      })();
    },
    retryBoot() {
      setBootError(null);
      setBooting(true);
      setBootAttempt((attempt) => attempt + 1);
    },
    setTheme(next) {
      setThemeState(next);
      void store.setItem("valueor.mobile.theme", next);
    },
    async accessToken() {
      const current = await supabase?.auth.getSession();
      return current?.data.session?.access_token ?? null;
    },
    async signIn(input) {
      if (!config || !supabase) return { ok: false, message: translate(language, "missingConfig") };
      const result = await signInToInstance({
        apiUrl: config.apiUrl,
        store,
        auth: {
          signInWithPassword: (credentials) => supabase.auth.signInWithPassword(credentials),
          signOut: async () => {
            await supabase.auth.signOut();
          },
          resetPasswordForEmail: (email, options) => supabase.auth.resetPasswordForEmail(email, options),
        },
      }, input);
      if (!result.ok) return { ok: false, message: localizeAuthMessage(language, result.code) };
      await store.setItem("valueor.mobile.instance", result.tokens.instanceHostname);
      if (!input.remember) await store.removeItem("valueor.mobile.instance");
      setSession(result.session);
      setInstanceHostname(result.tokens.instanceHostname);
      return { ok: true };
    },
    async recover(input) {
      if (!supabase) return { ok: false, message: translate(language, "missingConfig") };
      const result = await requestPasswordReset({
        auth: {
          signInWithPassword: (credentials) => supabase.auth.signInWithPassword(credentials),
          signOut: async () => {
            await supabase.auth.signOut();
          },
          resetPasswordForEmail: (email, options) => supabase.auth.resetPasswordForEmail(email, options),
        },
      }, input);
      return result.ok ? { ok: true } : { ok: false, message: localizeAuthMessage(language, result.code) };
    },
    async signOut() {
      const token = await supabase?.auth.getSession();
      if (token?.data.session?.access_token && config && instanceHostname) {
        await fetch(`${config.apiUrl}/api/mobile/push-token`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token.data.session.access_token}`,
            "X-ValueOR-Instance": instanceHostname,
            Accept: "application/json",
          },
        }).catch(() => undefined);
      }
      if (supabase) {
        await signOutMobileSession({
          store,
          auth: {
            signInWithPassword: (credentials) => supabase.auth.signInWithPassword(credentials),
            signOut: async () => {
              await supabase.auth.signOut();
            },
            resetPasswordForEmail: (email, options) => supabase.auth.resetPasswordForEmail(email, options),
          },
        });
      }
      for (const key of storageKeysRemovedOnSignOut()) await store.removeItem(key);
      setSession(null);
      setInstanceHostname(null);
      queryClient.clear();
    },
  }), [bootAttempt, booting, bootError, config, configError, direction, directionNotice, instanceHostname, language, offline, palette, session, store, supabase, theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider value={value}>
        <View style={{ flex: 1, direction, backgroundColor: palette.background }}>
          {directionNotice ? <Text style={{ color: palette.text, textAlign: direction === "rtl" ? "right" : "left", padding: 12 }}>{directionNotice}</Text> : null}
          {children}
        </View>
      </SessionContext.Provider>
    </QueryClientProvider>
  );
}

export function useAppSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("session_missing");
  return value;
}
