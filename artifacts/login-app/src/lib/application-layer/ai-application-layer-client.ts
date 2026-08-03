import type { ApplicationContext, ApplicationServices } from "@workspace/application-layer";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "./application-layer-bootstrap.js";
import type { LoginAppPortContext } from "./adapters/customer-read-port-adapter.js";

/** Allowed Application Layer queries for AI runtime — no Supabase, no repositories. */
export type AiApplicationLayerClient = Readonly<{
  context: ApplicationContext;
  services: ApplicationServices;
  customer360Aggregate(customerId: string, templateKey?: string): ReturnType<ApplicationServices["customer360"]["getCustomer360Aggregate"]>;
  operationsQueue(filter?: { search?: string; page?: number; pageSize?: number }): ReturnType<ApplicationServices["operations"]["getQueue"]>;
  dashboard(period?: "today" | "7d" | "30d" | "90d"): ReturnType<ApplicationServices["dashboard"]["getDashboard"]>;
  timeline(entityType: string, entityId: string, limit?: number): ReturnType<ApplicationServices["timeline"]["getTimeline"]>;
  notifications(filter?: { unreadOnly?: boolean; page?: number; pageSize?: number }): ReturnType<ApplicationServices["notification"]["getNotifications"]>;
  workspace(entityType: string, entityId: string, templateKey?: string): ReturnType<ApplicationServices["workspace"]["getWorkspace"]>;
  analytics(templateKey?: string): ReturnType<ApplicationServices["analytics"]["getAnalytics"]>;
  executiveInsights(period?: "today" | "7d" | "30d" | "90d"): ReturnType<ApplicationServices["executiveInsights"]["getInsights"]>;
  knowledgeDocument(documentId: string): ReturnType<ApplicationServices["knowledge"]["getDocument"]>;
  aiSummary(entityType: string, entityId: string): ReturnType<ApplicationServices["ai"]["generateSummary"]>;
}>;

export function createAiApplicationLayerClient(portContext: LoginAppPortContext): AiApplicationLayerClient {
  const registry = createLoginAppApplicationLayerRegistry(portContext);
  const services = registry.getServices();
  const context = buildApplicationContext({
    tenantId: portContext.companyId,
    actorId: portContext.actorUserId,
    permissions: permissionCodes(portContext.hasPermission, portContext.isSuperAdmin),
  });

  return Object.freeze({
    context,
    services,
    customer360Aggregate(customerId, templateKey) {
      return services.customer360.getCustomer360Aggregate({ customerId, templateKey }, context);
    },
    operationsQueue(filter) {
      return services.operations.getQueue(filter ?? {}, context);
    },
    dashboard(period = "30d") {
      return services.dashboard.getDashboard({ period, comparePrevious: true, templateKey: "clinic" }, context);
    },
    timeline(entityType, entityId, limit = 50) {
      return services.timeline.getTimeline({ entityType, entityId, limit }, context);
    },
    notifications(filter) {
      return services.notification.getNotifications(filter ?? {}, context);
    },
    workspace(entityType, entityId, templateKey) {
      return services.workspace.getWorkspace({ entityType, entityId, templateKey }, context);
    },
    analytics(templateKey) {
      return services.analytics.getAnalytics({ templateKey: templateKey ?? "clinic" }, context);
    },
    executiveInsights(period = "30d") {
      return services.executiveInsights.getInsights({ period, comparePrevious: true }, context);
    },
    knowledgeDocument(documentId) {
      return services.knowledge.getDocument(documentId, context);
    },
    aiSummary(entityType, entityId) {
      return services.ai.generateSummary({ entityType, entityId }, context);
    },
  });
}
