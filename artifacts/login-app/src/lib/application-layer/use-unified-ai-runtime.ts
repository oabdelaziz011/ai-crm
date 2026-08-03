import { useMemo } from "react";
import {
  createApplicationLayerRegistry,
  createContext,
  type ApplicationContext,
  type ApplicationServices,
  type UnifiedRuntimeExecuteRequest,
  type UnifiedRuntimeServiceContext,
} from "@workspace/application-layer";
import type { RuntimeIntegrationServices } from "@workspace/runtime-integration";
import type { AIExecutionServices } from "@workspace/ai-execution-engine";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { supabase } from "@/lib/supabase";
import { createLoginAppApplicationPorts, type LoginAppPortContext } from "./create-login-app-application-ports.js";
import { permissionCodes } from "./application-layer-bootstrap.js";
import { getLoginAppPlatformEventBus } from "./platform-event-bus-factory.js";
import {
  createInternalEnterpriseRuntimePort,
  createRuntimeCoordinatorPort,
} from "./unified-ai-runtime-factory.js";

export type UnifiedAIRuntimeHook = Readonly<{
  services: ApplicationServices;
  runtimeContext: UnifiedRuntimeServiceContext;
  execute: (
    request: UnifiedRuntimeExecuteRequest,
    appContext?: ApplicationContext,
  ) => ReturnType<ApplicationServices["ai"]["execute"]>;
  getInternalRuntime: () => ReturnType<ApplicationServices["ai"]["getInternalRuntime"]>;
}>;

/**
 * Single public AI runtime entry for login-app.
 * UI → AIApplicationService → Coordinator → Unified Runtime → Tool Router → Application Layer
 */
export function useUnifiedAIRuntime(
  runtimeIntegration: RuntimeIntegrationServices,
  executionServices: AIExecutionServices,
): UnifiedAIRuntimeHook {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();

  const portContext = useMemo<LoginAppPortContext | null>(() => {
    if (!profile?.company_id || !user?.id) return null;
    return {
      companyId: profile.company_id,
      actorUserId: user.id,
      isSuperAdmin,
      hasPermission,
    };
  }, [profile?.company_id, user?.id, isSuperAdmin, hasPermission]);

  const runtimeContext = useMemo<UnifiedRuntimeServiceContext>(
    () => ({
      userId: user?.id ?? null,
      companyId: profile?.company_id ?? null,
      isSuperAdmin,
      hasPermission,
    }),
    [user?.id, profile?.company_id, isSuperAdmin, hasPermission],
  );

  const unifiedServices = useMemo(() => {
    const coordinator = createRuntimeCoordinatorPort(runtimeIntegration);
    const internalRuntime = executionServices.enterpriseRuntime
      ? createInternalEnterpriseRuntimePort(executionServices)
      : undefined;

    if (!portContext) {
      return createApplicationLayerRegistry({
        useMockPorts: true,
        runtimeCoordinator: coordinator,
        internalEnterpriseRuntime: internalRuntime,
      }).getServices();
    }

    return createApplicationLayerRegistry({
      useMockPorts: false,
      ports: createLoginAppApplicationPorts(portContext, supabase),
      eventBus: getLoginAppPlatformEventBus(),
      runtimeCoordinator: coordinator,
      internalEnterpriseRuntime: internalRuntime,
    }).getServices();
  }, [portContext, runtimeIntegration, executionServices]);

  const execute = useMemo(
    () => (request: UnifiedRuntimeExecuteRequest, appContext?: ApplicationContext) => {
      const ctx =
        appContext ??
        createContext({
          tenantId: request.companyId,
          actorId: runtimeContext.userId ?? "system",
          actorType: "ai",
          permissions: permissionCodes(hasPermission, isSuperAdmin),
          correlationId: request.correlationId ?? crypto.randomUUID(),
        });
      return unifiedServices.ai.execute(runtimeContext, ctx, request);
    },
    [unifiedServices, runtimeContext, hasPermission, isSuperAdmin],
  );

  return {
    services: unifiedServices,
    runtimeContext,
    execute,
    getInternalRuntime: () => unifiedServices.ai.getInternalRuntime(),
  };
}
