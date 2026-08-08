import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useUser } from "@/context/auth-context";
import { useCompanyIdentity } from "@/hooks/company-workspace/use-company-identity";
import {
  DASHBOARD_ROUTE_REGISTRY,
  getDashboardRouteByNestedPath,
} from "@/config/dashboard-route-registry";
import type { FloatingAiPageContext } from "@/lib/floating-ai/types";
import {
  applyFloatingAiPatch,
  clearPageSpecificFields,
  floatingAiPatchChanged,
  floatingAiRegistrationEqual,
} from "@/lib/floating-ai/context-patch";
import { appPerfFloatingAiUpdate, appPerfProviderRender } from "@/lib/perf/app-render-perf";

type FloatingAiPageContextValue = {
  pageContext: FloatingAiPageContext;
  setPageContext: (context: Partial<FloatingAiPageContext>) => void;
  registerPageContext: (context: Partial<FloatingAiPageContext>) => void;
  clearPageSpecificContext: () => void;
};

type FloatingAiUiContextValue = {
  notificationCount: number;
  setNotificationCount: (count: number) => void;
  incrementNotifications: () => void;
  composerFocusRef: React.RefObject<HTMLTextAreaElement | null>;
  requestComposerFocus: () => void;
  pendingFocusOnOpen: boolean;
  consumePendingFocus: () => void;
  setPendingFocusOnOpen: (value: boolean) => void;
};

export type FloatingAiContextValue = FloatingAiPageContextValue & FloatingAiUiContextValue;

const FloatingAiPageContext = createContext<FloatingAiPageContextValue | null>(null);
const FloatingAiUiContext = createContext<FloatingAiUiContextValue | null>(null);

function routeToPageId(route: string): string {
  const segment = route.replace(/^\/+/, "").split("/")[0] ?? "home";
  if (!segment || segment === "dashboard") return "home";
  return segment;
}

function baseContextFromRoute(
  route: string,
  companyId: string | null,
  companyName: string | null,
  userId: string | null,
  userName: string | null,
  moduleLabel?: string,
  pageTitle?: string,
): FloatingAiPageContext {
  return {
    page: routeToPageId(route),
    route,
    companyId,
    companyName,
    userId,
    userName,
    moduleLabel,
    pageTitle,
  };
}

export function FloatingAiProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { t } = useTranslation("common");
  const { profile, company } = useUser();
  const companyId = profile?.company_id ?? company?.id ?? null;
  const { identity } = useCompanyIdentity(Boolean(companyId));
  const companyName = identity?.name ?? null;
  const userId = profile?.id ?? null;
  const userName = profile?.full_name ?? null;

  const composerFocusRef = useRef<HTMLTextAreaElement | null>(null);
  const [pendingFocusOnOpen, setPendingFocusOnOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const prevPageRef = useRef<string>("");

  const resolveModuleLabel = useCallback(
    (route: string) => {
      try {
        const match = getDashboardRouteByNestedPath(route);
        if (match) return t(match.titleKey);
      } catch {
        /* fallback */
      }
      const page = routeToPageId(route);
      const registryEntry = DASHBOARD_ROUTE_REGISTRY.find((r) => r.id === page || r.nestedPath === route);
      if (registryEntry) return t(registryEntry.titleKey);
      return page;
    },
    [t],
  );

  const [pageContext, setPageContextState] = useState<FloatingAiPageContext>(() =>
    baseContextFromRoute(
      location,
      companyId,
      companyName,
      userId,
      userName,
      resolveModuleLabel(location),
    ),
  );

  useEffect(() => {
    const page = routeToPageId(location);
    const moduleLabel = resolveModuleLabel(location);

    setPageContextState((prev) => {
      const routePatch: Partial<FloatingAiPageContext> =
        prevPageRef.current && prevPageRef.current !== page
          ? {
              ...clearPageSpecificFields(prev),
              page,
              route: location,
              companyId,
              companyName,
              userId,
              userName,
              moduleLabel,
              pageTitle: moduleLabel,
            }
          : {
              page,
              route: location,
              companyId,
              companyName,
              userId,
              userName,
              moduleLabel,
              pageTitle: prev.pageTitle ?? moduleLabel,
            };

      const next = applyFloatingAiPatch(prev, routePatch);
      if (next !== prev) {
        appPerfFloatingAiUpdate("route");
      }
      return next;
    });

    prevPageRef.current = page;
  }, [location, companyId, companyName, userId, userName, resolveModuleLabel]);

  const setPageContext = useCallback((patch: Partial<FloatingAiPageContext>) => {
    setPageContextState((prev) => {
      const next = applyFloatingAiPatch(prev, patch);
      if (next !== prev) {
        appPerfFloatingAiUpdate("setPageContext");
      }
      return next;
    });
  }, []);

  const registerPageContext = useCallback((context: Partial<FloatingAiPageContext>) => {
    setPageContextState((prev) => {
      const next = applyFloatingAiPatch(prev, context);
      if (next !== prev) {
        appPerfFloatingAiUpdate("registerPageContext");
      }
      return next;
    });
  }, []);

  const clearPageSpecificContext = useCallback(() => {
    setPageContextState((prev) => {
      const patch = clearPageSpecificFields(prev);
      if (!floatingAiPatchChanged(prev, patch)) {
        return prev;
      }
      appPerfFloatingAiUpdate("clearPageSpecific");
      return applyFloatingAiPatch(prev, patch);
    });
  }, []);

  const incrementNotifications = useCallback(() => {
    setNotificationCount((count) => count + 1);
  }, []);

  const requestComposerFocus = useCallback(() => {
    requestAnimationFrame(() => {
      composerFocusRef.current?.focus();
    });
  }, []);

  const consumePendingFocus = useCallback(() => {
    setPendingFocusOnOpen(false);
    requestComposerFocus();
  }, [requestComposerFocus]);

  const pageValue = useMemo<FloatingAiPageContextValue>(
    () => ({
      pageContext,
      setPageContext,
      registerPageContext,
      clearPageSpecificContext,
    }),
    [pageContext, setPageContext, registerPageContext, clearPageSpecificContext],
  );

  const uiValue = useMemo<FloatingAiUiContextValue>(
    () => ({
      notificationCount,
      setNotificationCount,
      incrementNotifications,
      composerFocusRef,
      requestComposerFocus,
      pendingFocusOnOpen,
      consumePendingFocus,
      setPendingFocusOnOpen,
    }),
    [
      notificationCount,
      incrementNotifications,
      requestComposerFocus,
      pendingFocusOnOpen,
      consumePendingFocus,
    ],
  );

  useEffect(() => {
    appPerfProviderRender("FloatingAiProvider");
  });

  return (
    <FloatingAiPageContext.Provider value={pageValue}>
      <FloatingAiUiContext.Provider value={uiValue}>{children}</FloatingAiUiContext.Provider>
    </FloatingAiPageContext.Provider>
  );
}

export function useFloatingAiPageContext(): FloatingAiPageContextValue {
  const ctx = useContext(FloatingAiPageContext);
  if (!ctx) {
    throw new Error("useFloatingAiPageContext must be used within FloatingAiProvider");
  }
  return ctx;
}

export function useFloatingAiUi(): FloatingAiUiContextValue {
  const ctx = useContext(FloatingAiUiContext);
  if (!ctx) {
    throw new Error("useFloatingAiUi must be used within FloatingAiProvider");
  }
  return ctx;
}

/** Combined view — prefer slice hooks to avoid cross-slice re-renders. */
export function useFloatingAi(): FloatingAiContextValue {
  return {
    ...useFloatingAiPageContext(),
    ...useFloatingAiUi(),
  };
}

/** Register rich page context from module pages — clears entity fields on unmount only */
export function useRegisterFloatingAiContext(context: Partial<FloatingAiPageContext> | null) {
  const { registerPageContext, clearPageSpecificContext } = useFloatingAiPageContext();
  const lastRegistrationRef = useRef<Partial<FloatingAiPageContext> | null>(null);

  useLayoutEffect(() => {
    if (!context) return;
    if (floatingAiRegistrationEqual(lastRegistrationRef.current, context)) {
      return;
    }
    lastRegistrationRef.current = context;
    registerPageContext(context);
  });

  useEffect(() => {
    return () => {
      lastRegistrationRef.current = null;
      clearPageSpecificContext();
    };
  }, [clearPageSpecificContext]);
}
