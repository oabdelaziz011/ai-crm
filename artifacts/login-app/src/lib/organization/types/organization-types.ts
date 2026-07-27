import type {
  AssignmentType,
  DepartmentType,
  HierarchyLevel,
  MaintenanceStatus,
  PolicyScopeLevel,
  PolicyType,
  SearchResultType,
  TransferStatus,
  TransferType,
} from "@/lib/organization/types/organization-enums";

export type OrganizationRegion = {
  id: string;
  companyId: string;
  name: string;
  code: string | null;
  description: string | null;
  managerUserId: string | null;
  timezone: string;
  isActive: boolean;
  branchCount?: number;
};

export type BranchGroup = {
  id: string;
  companyId: string;
  regionId: string | null;
  name: string;
  code: string | null;
  isActive: boolean;
  branchCount?: number;
};

export type OrganizationDepartment = {
  id: string;
  companyId: string;
  branchId: string;
  name: string;
  code: string | null;
  departmentType: DepartmentType;
  isActive: boolean;
};

export type HierarchyNode = {
  id: string;
  level: HierarchyLevel;
  name: string;
  parentId: string | null;
  children: HierarchyNode[];
  metadata?: Record<string, unknown>;
};

export type BranchProfile = {
  id: string;
  companyId: string;
  name: string;
  code: string | null;
  regionId: string | null;
  branchGroupId: string | null;
  timezone: string;
  currency: string;
  healthScore: number;
  status: string;
  branding: Record<string, unknown>;
  settings: Record<string, unknown>;
};

export type ResourceAssignment = {
  id: string;
  companyId: string;
  branchId: string;
  departmentId: string | null;
  resourceId: string;
  resourceName?: string;
  resourceType?: string;
  assignmentType: AssignmentType;
  utilizationTargetPercent: number;
  maintenanceStatus: MaintenanceStatus;
  isActive: boolean;
};

export type OrganizationPolicy = {
  id: string;
  companyId: string;
  scopeLevel: PolicyScopeLevel;
  scopeId: string | null;
  policyType: PolicyType;
  config: Record<string, unknown>;
  inheritsFromParent: boolean;
  priority: number;
  isActive: boolean;
};

export type OrganizationTransfer = {
  id: string;
  companyId: string;
  transferType: TransferType;
  status: TransferStatus;
  sourceBranchId: string | null;
  targetBranchId: string | null;
  entityType: string;
  entityId: string;
  reason: string | null;
  requestedBy: string | null;
  createdAt: string;
};

export type TransferRequest = {
  companyId: string;
  transferType: TransferType;
  sourceBranchId: string;
  targetBranchId: string;
  entityType: string;
  entityId: string;
  reason?: string;
  requestedBy: string;
};

export type SearchResult = {
  type: SearchResultType;
  id: string;
  label: string;
  metadata?: Record<string, unknown>;
};

export type BranchComparisonRow = {
  branchId: string;
  branchName: string;
  regionName: string | null;
  revenueCents: number;
  bookings: number;
  occupancy: number;
  noShowRate: number;
  cancellationRate: number;
  avgWaitMinutes: number;
  customerGrowth: number;
  healthScore: number;
  ranking: number;
};

export type OrganizationOverview = {
  regionCount: number;
  branchCount: number;
  departmentCount: number;
  resourceCount: number;
  pendingTransfers: number;
  averageHealthScore: number;
  hierarchy: HierarchyNode[];
};

export type EnterpriseAnalytics = {
  comparisons: BranchComparisonRow[];
  topPerformers: BranchComparisonRow[];
  underperformers: BranchComparisonRow[];
  heatmap: Array<{ branchId: string; metric: string; value: number }>;
};

export type OrganizationContext = {
  companyId: string;
  regionId?: string | null;
  branchId?: string | null;
  userId: string;
};

export type CrossBranchCustomerView = {
  customerId: string;
  name: string;
  totalVisits: number;
  branchVisits: Array<{ branchId: string; branchName: string; visitCount: number }>;
  sharedTimeline: boolean;
  sharedInvoices: boolean;
};
