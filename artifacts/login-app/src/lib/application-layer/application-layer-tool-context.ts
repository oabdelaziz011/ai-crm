import { randomUUID } from "node:crypto";
import {
  createContext,
  createApplicationLayerRegistry,
  type ApplicationContext,
  type ApplicationServices,
} from "@workspace/application-layer";
import type { LoginAppPortContext } from "./adapters/customer-read-port-adapter.js";
import { createLoginAppApplicationPorts } from "./create-login-app-application-ports.js";
import { permissionCodes } from "./application-layer-bootstrap.js";
import { supabase } from "@/lib/supabase";
import { getLoginAppPlatformEventBus } from "./platform-event-bus-factory.js";

export function buildToolApplicationContext(
  portContext: LoginAppPortContext,
  actorUserId: string,
): ApplicationContext {
  return createContext({
    tenantId: portContext.companyId,
    actorId: actorUserId,
    actorType: "ai",
    permissions: permissionCodes(portContext.hasPermission, portContext.isSuperAdmin),
    correlationId: randomUUID(),
    locale: "en",
  });
}

export function createLoginAppApplicationServices(portContext: LoginAppPortContext): ApplicationServices {
  const ports = createLoginAppApplicationPorts(portContext, supabase);
  const registry = createApplicationLayerRegistry({
    useMockPorts: false,
    ports,
    eventBus: getLoginAppPlatformEventBus(),
  });
  return registry.getServices();
}

export function unwrapCommand<T>(result: { data: T }): T {
  return result.data;
}

export function unwrapQuery<T>(result: { data: T }): T {
  return result.data;
}
