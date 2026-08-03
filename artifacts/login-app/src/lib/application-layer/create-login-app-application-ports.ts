import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createMockApplicationPorts,
  type ApplicationPorts,
} from "@workspace/application-layer";
import { supabase } from "@/lib/supabase";
import { createLoginAppCustomerReadPort, type LoginAppPortContext } from "./adapters/customer-read-port-adapter.js";
import { createLoginAppCustomerWritePort } from "./adapters/customer-write-port-adapter.js";
import { createLoginAppLeadReadPortAdapter } from "./adapters/lead-read-port-adapter.js";
import { createLoginAppTimelineReadPort } from "./adapters/timeline-read-port-adapter.js";
import { createLoginAppBookingReadPort } from "./adapters/booking-read-port-adapter.js";
import { createLoginAppBookingWritePort } from "./adapters/booking-write-port-adapter.js";
import { createLoginAppInvoiceReadPort } from "./adapters/invoice-read-port-adapter.js";
import { createLoginAppPaymentReadPort } from "./adapters/payment-read-port-adapter.js";
import { createLoginAppCustomerAddressReadPort } from "./adapters/crm-empty-read-port-adapters.js";
import { createLoginAppTaskReadPort } from "./adapters/crm-empty-read-port-adapters.js";
import {
  createLoginAppEntityContactReadPort,
  createLoginAppEntityContactWritePort,
  createLoginAppEntityFileReadPort,
  createLoginAppEntityFileWritePort,
  createLoginAppEntityTagReadPort,
  createLoginAppEntityTagWritePort,
  createLoginAppEntityCustomFieldReadPort,
  createLoginAppEntityCustomFieldWritePort,
  createLoginAppEntityActivityReadPort,
  createLoginAppEntityActivityWritePort,
} from "./adapters/entity-port-adapters.js";
import {
  createCustomerTagReadPortFromEntity,
  createCustomerContactReadPortFromEntity,
  createCustomerCustomFieldReadPortFromEntity,
  createFileReadPortFromEntity,
  createActivityReadPortFromEntity,
} from "./adapters/entity-customer-facade-adapters.js";
import { createLoginAppGlobalSearchReadPort } from "./adapters/global-search-read-port-adapter.js";
import { createLoginAppPaymentWritePort } from "./adapters/payment-write-port-adapter.js";
import { createLoginAppInvoiceWritePort } from "./adapters/invoice-write-port-adapter.js";
import { createLoginAppLeadWritePort } from "./adapters/lead-write-port-adapter.js";
import { createLoginAppTaskWritePort } from "./adapters/task-write-port-adapter.js";
import { createLoginAppFileWritePort } from "./adapters/file-write-port-adapter.js";
import { createLoginAppWorkflowWritePort } from "./adapters/workflow-write-port-adapter.js";
import { createLoginAppKnowledgeReadPort } from "./adapters/knowledge-read-port-adapter.js";
import { createLoginAppKnowledgeWritePort } from "./adapters/knowledge-write-port-adapter.js";
import { createLoginAppSchedulingQueryPort } from "./adapters/scheduling-query-port-adapter.js";
import {
  createLoginAppTicketReadPort,
  createLoginAppTicketWritePort,
} from "./adapters/ticket-port-adapters.js";
import { createLoginAppHandoffWritePort } from "./adapters/handoff-write-port-adapter.js";
import { createLoginAppOperationsWorkspaceReadPort } from "./adapters/operations-workspace-read-port-adapter.js";
import { createLoginAppConfigurationReadPort } from "./adapters/configuration-read-port-adapter.js";
import { createLoginAppConfigurationWritePort } from "./adapters/configuration-write-port-adapter.js";
import { createLoginAppFeatureFlagReadPort } from "./adapters/feature-flag-read-port-adapter.js";
import { createLoginAppFeatureFlagWritePort } from "./adapters/feature-flag-write-port-adapter.js";
import { createLoginAppLicenseReadPort } from "./adapters/license-read-port-adapter.js";
import { createLoginAppLicenseWritePort } from "./adapters/license-write-port-adapter.js";
import { createConfigurationCachePort } from "@workspace/application-layer";
import { createLoginAppAnalyticsReadPort } from "./adapters/analytics-read-port-adapter.js";
import { createLoginAppRevenueReadPort } from "./adapters/revenue-read-port-adapter.js";
import { createLoginAppEmployeeReadPort } from "./adapters/employee-read-port-adapter.js";
import {
  createLoginAppNotificationReadPort,
  createLoginAppNotificationWritePort,
} from "./adapters/notification-port-adapters.js";
import { createLoginAppEntityRelationshipReadPort } from "./adapters/entity-relationship-read-port-adapter.js";

/** Builds live Supabase-backed application ports for the current tenant context. */
export function createLoginAppApplicationPorts(
  ctx: LoginAppPortContext,
  client: SupabaseClient = supabase,
): ApplicationPorts {
  const mockFallback = createMockApplicationPorts();

  const entityContactRead = createLoginAppEntityContactReadPort(client, ctx);
  const entityContactWrite = createLoginAppEntityContactWritePort(client, ctx);
  const entityFileRead = createLoginAppEntityFileReadPort(client, ctx);
  const entityFileWrite = createLoginAppEntityFileWritePort(client, ctx);
  const entityTagRead = createLoginAppEntityTagReadPort(client, ctx);
  const entityTagWrite = createLoginAppEntityTagWritePort(client, ctx);
  const entityCustomFieldRead = createLoginAppEntityCustomFieldReadPort(client, ctx);
  const entityCustomFieldWrite = createLoginAppEntityCustomFieldWritePort(client, ctx);
  const entityActivityRead = createLoginAppEntityActivityReadPort(client, ctx);
  const entityActivityWrite = createLoginAppEntityActivityWritePort(client, ctx);
  const configurationRead = createLoginAppConfigurationReadPort(client, ctx);
  const configurationWrite = createLoginAppConfigurationWritePort(client, ctx);
  const configurationCache = createConfigurationCachePort();
  const featureFlagRead = createLoginAppFeatureFlagReadPort(client, ctx);
  const featureFlagWrite = createLoginAppFeatureFlagWritePort(client, ctx);
  const licenseRead = createLoginAppLicenseReadPort(client, ctx);
  const licenseWrite = createLoginAppLicenseWritePort(client, ctx);

  return Object.freeze({
    ...mockFallback,
    customerRead: createLoginAppCustomerReadPort(client, ctx),
    customerWrite: createLoginAppCustomerWritePort(client, ctx),
    leadRead: createLoginAppLeadReadPortAdapter(client, ctx),
    timelineRead: createLoginAppTimelineReadPort(client, ctx),
    customerTagRead: createCustomerTagReadPortFromEntity(entityTagRead),
    customerAddressRead: createLoginAppCustomerAddressReadPort(client, ctx),
    customerContactRead: createCustomerContactReadPortFromEntity(entityContactRead),
    customerCustomFieldRead: createCustomerCustomFieldReadPortFromEntity(entityCustomFieldRead),
    activityRead: createActivityReadPortFromEntity(entityActivityRead),
    fileRead: createFileReadPortFromEntity(entityFileRead),
    taskRead: createLoginAppTaskReadPort(client, ctx),
    bookingRead: createLoginAppBookingReadPort(client, ctx),
    bookingWrite: createLoginAppBookingWritePort(client, ctx),
    invoiceRead: createLoginAppInvoiceReadPort(client, ctx),
    paymentRead: createLoginAppPaymentReadPort(client, ctx),
    paymentWrite: createLoginAppPaymentWritePort(client, ctx),
    invoiceWrite: createLoginAppInvoiceWritePort(client, ctx),
    leadWrite: createLoginAppLeadWritePort(client, ctx),
    analyticsRead: createLoginAppAnalyticsReadPort(client, ctx),
    revenueRead: createLoginAppRevenueReadPort(client, ctx),
    employeeRead: createLoginAppEmployeeReadPort(client, ctx),
    globalSearchRead: createLoginAppGlobalSearchReadPort(client, ctx, {
      entityContactRead,
      entityTagRead,
      entityFileRead,
      entityActivityRead,
      entityCustomFieldRead,
    }),
    notificationRead: createLoginAppNotificationReadPort(client, ctx),
    notificationWrite: createLoginAppNotificationWritePort(client, ctx),
    entityContactRead,
    entityContactWrite,
    entityFileRead,
    entityFileWrite,
    entityTagRead,
    entityTagWrite,
    entityCustomFieldRead,
    entityCustomFieldWrite,
    entityActivityRead,
    entityActivityWrite,
    entityRelationshipRead: createLoginAppEntityRelationshipReadPort(ctx),
    taskWrite: createLoginAppTaskWritePort(client, ctx),
    fileWrite: createLoginAppFileWritePort(entityFileWrite, ctx),
    workflowWrite: createLoginAppWorkflowWritePort(client, ctx),
    knowledgeRead: createLoginAppKnowledgeReadPort(client, ctx),
    knowledgeWrite: createLoginAppKnowledgeWritePort(client, ctx),
    schedulingQuery: createLoginAppSchedulingQueryPort(client),
    ticketRead: createLoginAppTicketReadPort(client, ctx),
    ticketWrite: createLoginAppTicketWritePort(client, ctx),
    handoffWrite: createLoginAppHandoffWritePort(client, ctx),
    configurationRead,
    configurationWrite,
    configurationCache,
    featureFlagRead,
    featureFlagWrite,
    licenseRead,
    licenseWrite,
    operationsWorkspaceRead: createLoginAppOperationsWorkspaceReadPort(configurationRead, ctx),
  });
}

export type { LoginAppPortContext };
