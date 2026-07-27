import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import {
  DASHBOARD_ROUTE_REGISTRY,
  getDashboardRouteByNestedPath,
} from "@/config/dashboard-route-registry";
import type { FloatingAiPageContext } from "@/lib/floating-ai/types";
import { PAGE_SPECIFIC_CONTEXT_KEYS } from "@/lib/floating-ai/types";

type FloatingAiContextValue = {
  pageContext: FloatingAiPageContext;
  setPageContext: (context: Partial<FloatingAiPageContext>) => void;
  registerPageContext: (context: Partial<FloatingAiPageContext>) => void;
  clearPageSpecificContext: () => void;
  notificationCount: number;
  setNotificationCount: (count: number) => void;
  incrementNotifications: () => void;
  /** Ref for composer focus — Ctrl+K targets this */
  composerFocusRef: React.RefObject<HTMLTextAreaElement | null>;
  requestComposerFocus: () => void;
  pendingFocusOnOpen: boolean;
  consumePendingFocus: () => void;
  setPendingFocusOnOpen: (value: boolean) => void;
};

const FloatingAiContext = createContext<FloatingAiContextValue | null>(null);

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

function clearPageSpecificFields(context: FloatingAiPageContext): Partial<FloatingAiPageContext> {
  const patch: Partial<FloatingAiPageContext> = {};
  for (const key of PAGE_SPECIFIC_CONTEXT_KEYS) {
    if (key === "selectedRows") {
      patch.selectedRows = [];
    } else if (key === "selectedCount") {
      patch.selectedCount = 0;
    } else if (key === "filters") {
      patch.filters = {};
    } else {
      (patch as Record<string, unknown>)[key] = null;
    }
  }
  return patch;
}

export function FloatingAiProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { t } = useTranslation("common");
  const { profile, company } = useAuth();
  const companyId = profile?.company_id ?? company?.id ?? null;
  const companyName = company?.name ?? null;
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

  /** Smart context switch: update module/route on navigation, preserve conversation (separate store) */
  useEffect(() => {
    const page = routeToPageId(location);
    const moduleLabel = resolveModuleLabel(location);

    if (prevPageRef.current && prevPageRef.current !== page) {
      setPageContextState((prev) => ({
        ...prev,
        ...clearPageSpecificFields(prev),
        page,
        route: location,
        companyId,
        companyName,
        userId,
        userName,
        moduleLabel,
        pageTitle: moduleLabel,
      }));
    } else {
      setPageContextState((prev) => ({
        ...prev,
        page,
        route: location,
        companyId,
        companyName,
        userId,
        userName,
        moduleLabel,
        pageTitle: prev.pageTitle ?? moduleLabel,
      }));
    }

    prevPageRef.current = page;
  }, [location, companyId, companyName, userId, userName, resolveModuleLabel]);

  const setPageContext = useCallback((patch: Partial<FloatingAiPageContext>) => {
    setPageContextState((prev) => ({ ...prev, ...patch }));
  }, []);

  const registerPageContext = useCallback((context: Partial<FloatingAiPageContext>) => {
    setPageContextState((prev) => ({ ...prev, ...context }));
  }, []);

  const clearPageSpecificContext = useCallback(() => {
    setPageContextState((prev) => ({ ...prev, ...clearPageSpecificFields(prev) }));
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

  const value = useMemo<FloatingAiContextValue>(
    () => ({
      pageContext,
      setPageContext,
      registerPageContext,
      clearPageSpecificContext,
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
      pageContext,
      setPageContext,
      registerPageContext,
      clearPageSpecificContext,
      notificationCount,
      incrementNotifications,
      requestComposerFocus,
      pendingFocusOnOpen,
      consumePendingFocus,
    ],
  );

  return <FloatingAiContext.Provider value={value}>{children}</FloatingAiContext.Provider>;
}

export function useFloatingAi(): FloatingAiContextValue {
  const ctx = useContext(FloatingAiContext);
  if (!ctx) {
    throw new Error("useFloatingAi must be used within FloatingAiProvider");
  }
  return ctx;
}

/** Register rich page context from module pages — clears entity fields on unmount only */
export function useRegisterFloatingAiContext(context: Partial<FloatingAiPageContext> | null) {
  const { registerPageContext, clearPageSpecificContext } = useFloatingAi();
  const serialized = context ? JSON.stringify(context) : null;

  useEffect(() => {
    if (!context) return;
    registerPageContext(context);
  }, [serialized, registerPageContext, context]);

  useEffect(() => {
    return () => clearPageSpecificContext();
  }, [clearPageSpecificContext]);
}
