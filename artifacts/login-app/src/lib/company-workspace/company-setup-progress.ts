import type { CompanyWorkspaceTabId } from "@/lib/company-workspace/types";
import { isSubscriptionActiveStatus } from "@/lib/company-workspace/executive-overview-health";

export type CompanySetupItemId =
  | "companyProfile"
  | "branding"
  | "subscription"
  | "branches"
  | "departments"
  | "employees"
  | "aiProvider"
  | "channels";

export type CompanySetupDestination =
  | { kind: "tab"; tab: CompanyWorkspaceTabId }
  | { kind: "path"; path: string };

export type CompanySetupItem = {
  id: CompanySetupItemId;
  complete: boolean;
  destination: CompanySetupDestination;
};

export type CompanySetupProgress = {
  percent: number;
  completedCount: number;
  totalCount: number;
  items: CompanySetupItem[];
  completed: CompanySetupItem[];
  remaining: CompanySetupItem[];
};

/**
 * Guided company setup checklist from real workspace signals only.
 * No mock completion — missing data means incomplete.
 */
export function computeCompanySetupProgress(input: {
  companyExists: boolean;
  hasPrimaryLogo: boolean;
  hasPrimaryColor: boolean;
  subscriptionStatus: string | null | undefined;
  branchesCount: number;
  departmentsCount: number;
  employeesCount: number;
  /** null = unknown / not loaded — item omitted from progress. */
  aiProviderConnected: boolean | null;
  /** null = unknown / not loaded — item omitted from progress. */
  connectedChannels: number | null;
}): CompanySetupProgress {
  const items: CompanySetupItem[] = [
    {
      id: "companyProfile",
      complete: input.companyExists,
      destination: { kind: "tab", tab: "branding" },
    },
    {
      id: "branding",
      complete: input.hasPrimaryLogo && input.hasPrimaryColor,
      destination: { kind: "tab", tab: "branding" },
    },
    {
      id: "subscription",
      complete: isSubscriptionActiveStatus(input.subscriptionStatus),
      destination: { kind: "tab", tab: "subscription" },
    },
    {
      id: "branches",
      complete: input.branchesCount > 0,
      destination: { kind: "tab", tab: "branches" },
    },
    {
      id: "departments",
      complete: input.departmentsCount > 0,
      destination: { kind: "tab", tab: "departments" },
    },
    {
      id: "employees",
      complete: input.employeesCount > 0,
      destination: { kind: "tab", tab: "employees" },
    },
  ];

  if (input.aiProviderConnected != null) {
    items.push({
      id: "aiProvider",
      complete: input.aiProviderConnected,
      // `~` escapes the /dashboard nest — never pass bare /dashboard/... here.
      destination: { kind: "path", path: "~/dashboard/ai-assistant" },
    });
  }

  if (input.connectedChannels != null) {
    items.push({
      id: "channels",
      complete: input.connectedChannels > 0,
      destination: { kind: "path", path: "~/dashboard/channels" },
    });
  }

  const completed = items.filter((i) => i.complete);
  const remaining = items.filter((i) => !i.complete);
  const totalCount = items.length;
  const completedCount = completed.length;
  const percent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return {
    percent,
    completedCount,
    totalCount,
    items,
    completed,
    remaining,
  };
}
