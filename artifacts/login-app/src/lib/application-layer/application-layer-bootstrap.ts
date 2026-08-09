import {

  createApplicationLayerRegistry,

  createContext,

  type ApplicationContext,

  type ApplicationLayerRegistry,

  createProductionSubscribers,

  type ProductionSubscriberDeps,

} from "@workspace/application-layer";

import { createConfiguredPlatformEventBus, type PlatformEventBus } from "@workspace/platform-events";

import { supabase } from "@/lib/supabase";

import { createLoginAppApplicationPorts, type LoginAppPortContext } from "./create-login-app-application-ports.js";

import {

  createSupabaseAuditTrailStore,

  createSupabaseCorrelationStore,

  createSupabaseDeadLetterQueue,

  createSupabaseEventTelemetry,

  createSupabaseIdempotencyStore,

  createSupabaseTimelineStore,

} from "./adapters/platform-event-store-adapters.js";

import { createLoginAppReactiveSignalPort } from "./adapters/reactive-signal-port-adapter.js";

import { createLoginAppAutomationDispatchPort } from "./adapters/automation-dispatch-port-adapter.js";
import { createIntegrationEventSubscriber } from "./adapters/integration-event-subscriber.js";

import { getLoginAppPlatformEventBus as getSharedEventBus } from "./platform-event-bus-factory.js";



export { getSharedEventBus as getLoginAppPlatformEventBus };



export function buildApplicationContext(input: {

  tenantId: string;

  actorId: string;

  permissions: readonly string[];

  locale?: string;

  correlationId?: string;

}): ApplicationContext {

  return createContext({

    tenantId: input.tenantId,

    actorId: input.actorId,

    permissions: input.permissions,

    locale: input.locale ?? "en",

    correlationId: input.correlationId,

  });

}



export function createLoginAppApplicationLayerRegistry(ctx: LoginAppPortContext): ApplicationLayerRegistry {

  const ports = createLoginAppApplicationPorts(ctx, supabase);

  const reactive = createLoginAppReactiveSignalPort(supabase);

  const automation = createLoginAppAutomationDispatchPort();



  const tempRegistry = createApplicationLayerRegistry({

    useMockPorts: false,

    ports,

    eventBus: createConfiguredPlatformEventBus([], { awaitSubscribers: false }),

  });



  const deps: ProductionSubscriberDeps = {

    getServices: () => tempRegistry.getServices(),

    ports,

    reactive,

    automation,

    buildSystemContext: (envelope) =>

      createContext({

        tenantId: envelope.tenantId,

        actorId: envelope.actorId ?? "system",

        actorType: "system",

        permissions: ["*"],

        correlationId: envelope.correlationId,

      }),

  };



  const eventBus = createConfiguredPlatformEventBus(
    [...createProductionSubscribers(deps), createIntegrationEventSubscriber()],
    {

    auditStore: createSupabaseAuditTrailStore(supabase),

    timelineStore: createSupabaseTimelineStore(supabase),

    correlationStore: createSupabaseCorrelationStore(supabase),

    idempotencyStore: createSupabaseIdempotencyStore(supabase),

    deadLetterQueue: createSupabaseDeadLetterQueue(supabase),

    telemetry: createSupabaseEventTelemetry(supabase),

    awaitSubscribers: false,

  });



  return createApplicationLayerRegistry({

    useMockPorts: false,

    ports,

    eventBus,

  });

}



export function permissionCodes(hasPermission: (code: string) => boolean, isSuperAdmin: boolean): string[] {

  if (isSuperAdmin) return ["*"];

  const codes: string[] = [];

  const map = [

    "customers.view",

    "bookings.view",

    "executive.view",

    "dashboard.view",

    "notification.read",

    "notifications.view",

    "leads.view",

    "leads.create",

    "leads.edit",

    "leads.assign",

    "leads.convert",

    "leads.delete",

    "leads.pipeline.manage",

    "entity.contacts.read",

    "entity.contacts.write",

    "entity.tags.read",

    "entity.files.read",

    "entity.activities.read",

    "entity.custom_fields.read",

    "entity.files.write",

    "operations.read",

    "operations.write",

    "tasks.read",

    "tasks.write",

    "workflow.execute",

    "configuration.read",

    "configuration.write",

    "configuration.publish",

    "configuration.operations.read",

    "configuration.operations.write",

    "operations.universal.configure",

    "operations.configuration.manage",

    "feature_flags.read",

    "feature_flags.write",

    "feature_flags.publish",

    "licenses.read",

    "licenses.write",

    "licenses.assign",

    "quotes.view",

    "quotes.create",

    "quotes.edit",

    "quotes.send",

    "quotes.approve",

    "quotes.delete",

    "opportunities.view",

    "opportunities.create",

    "opportunities.edit",

    "products.view",

    "products.create",

    "products.edit",

  ];

  for (const code of map) {

    if (hasPermission(code)) codes.push(code);

  }

  if (
    hasPermission("operations.universal.configure")
    || hasPermission("operations.configuration.manage")
  ) {
    for (const implied of [
      "configuration.read",
      "configuration.write",
      "configuration.publish",
      "configuration.operations.read",
      "configuration.operations.write",
    ]) {
      if (!codes.includes(implied)) codes.push(implied);
    }
  }

  if (

    hasPermission("customers.view") ||

    hasPermission("bookings.view") ||

    hasPermission("executive.view") ||

    hasPermission("dashboard.view") ||

    hasPermission("notification.read") ||

    hasPermission("notifications.view") ||

    hasPermission("leads.view")

  ) {

    return ["*"];

  }

  if (hasPermission("notification.write") || hasPermission("notifications.manage")) {

    codes.push("notification.write");

  }

  return codes;

}


