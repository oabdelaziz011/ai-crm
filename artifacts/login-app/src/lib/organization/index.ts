/** Enterprise Multi-Branch Management Platform */
export * from "@/lib/organization/types";
export { getOrganizationPlatformServices, createOrganizationPlatformServices } from "@/lib/organization/services/organization-platform-factory";
export { OrganizationPlatformService } from "@/lib/organization/services/organization-platform-service";
export { TransferEngineService } from "@/lib/organization/transfers/transfer-engine-service";
export { PolicyInheritanceService } from "@/lib/organization/services/organization-platform-service";
export { EnterpriseSearchService } from "@/lib/organization/services/organization-platform-service";
export {
  useOrganizationOverview,
  useOrganizationAnalytics,
  useOrganizationTransfers,
  useOrganizationSearch,
  useRequestTransfer,
  useApproveTransfer,
  useExecuteTransfer,
} from "@/lib/organization/hooks/use-organization-dashboard";
export { buildHierarchyTree } from "@/lib/organization/selectors/hierarchy-selector";
export { resolvePolicyChain } from "@/lib/organization/selectors/policy-selector";
export { ORGANIZATION_PERMISSIONS, canViewOrganization } from "@/lib/organization/security/organization-permissions";
