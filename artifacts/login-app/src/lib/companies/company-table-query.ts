import type { Company, CompanyApprovalStatus } from "@/lib/types";
import { resolveCompanyApprovalStatus } from "@/lib/companies/company-list-filters";

export const COMPANY_TABLE_PAGE_SIZE = 8;

export type CompanyDisplayStatus =
  | "all"
  | "pending"
  | "active"
  | "trial"
  | "suspended"
  | "rejected";

export type CompanyPackageFilterKey =
  | "all"
  | "none"
  | "basic"
  | "pro"
  | "enterprise"
  | "trial"
  | "custom"
  | "contract";

export type CompanyTextMatchMode = "contains" | "startsWith";

export type CompanyTableSortKey = "updated_at" | "created_at" | "name" | "status" | "package";

export type CompanyTableSort = {
  key: CompanyTableSortKey;
  direction: "asc" | "desc";
};

export type CompanyTextColumnFilter = {
  value: string;
  mode: CompanyTextMatchMode;
};

export type CompanyTableFilters = {
  search: string;
  displayStatus: CompanyDisplayStatus;
  packageKey: CompanyPackageFilterKey | string;
  industry: string;
  businessType: string;
  owner: string;
  location: string;
  name: CompanyTextColumnFilter;
  email: CompanyTextColumnFilter;
  phone: CompanyTextColumnFilter;
  createdFrom: string | null;
  createdTo: string | null;
  updatedFrom: string | null;
  updatedTo: string | null;
};

export const DEFAULT_COMPANY_TABLE_SORT: CompanyTableSort = {
  key: "updated_at",
  direction: "desc",
};

export const EMPTY_COMPANY_TABLE_FILTERS: CompanyTableFilters = {
  search: "",
  displayStatus: "all",
  packageKey: "all",
  industry: "all",
  businessType: "all",
  owner: "",
  location: "",
  name: { value: "", mode: "contains" },
  email: { value: "", mode: "contains" },
  phone: { value: "", mode: "contains" },
  createdFrom: null,
  createdTo: null,
  updatedFrom: null,
  updatedTo: null,
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CANONICAL_PACKAGE_KEYS = [
  "basic",
  "pro",
  "enterprise",
  "trial",
  "custom",
  "contract",
] as const;

type PlanLike = {
  code?: string | null;
  name?: string | null;
  display_name?: string | null;
};

function firstPlan(company: Pick<Company, "plan">): PlanLike | null {
  const plan = company.plan as PlanLike | PlanLike[] | null | undefined;
  if (!plan) return null;
  return Array.isArray(plan) ? (plan[0] ?? null) : plan;
}

function firstBranch(
  company: Pick<Company, "primary_branch">,
): { city?: string | null; country?: string | null } | null {
  const branch = company.primary_branch;
  if (!branch) return null;
  return Array.isArray(branch) ? (branch[0] ?? null) : branch;
}

function firstBillingAddress(company: Pick<Company, "billing_profile">): string {
  const profile = company.billing_profile;
  const row = Array.isArray(profile) ? profile[0] : profile;
  return row?.address?.trim() || "";
}

export function companyLocationText(company: Company): string {
  const branch = firstBranch(company);
  const parts = [branch?.city, branch?.country].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  return firstBillingAddress(company);
}

export function isCompaniesWorkspaceRow(company: Pick<Company, "company_type">): boolean {
  return company.company_type !== "platform";
}

export function isLeftoverDeletedTestCompanyName(name: string): boolean {
  return /\bDELETED\b/i.test(name.trim());
}

export function resolveCompanyDisplayStatus(
  company: Pick<Company, "status" | "approval_status">,
): Exclude<CompanyDisplayStatus, "all"> {
  const approval = resolveCompanyApprovalStatus(company);
  if (approval === "pending") return "pending";
  if (approval === "rejected") return "rejected";
  if (company.status === "Active") return "active";
  if (company.status === "Trial") return "trial";
  return "suspended";
}

function normalizePackageToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function resolveCompanyPackageKey(
  company: Pick<Company, "subscription_plan" | "plan">,
): string | null {
  const plan = firstPlan(company);
  const raw =
    [plan?.code, plan?.name, plan?.display_name, company.subscription_plan]
      .map((value) => String(value ?? "").trim())
      .find(Boolean) ?? "";
  if (!raw || UUID_RE.test(raw)) return null;

  const token = normalizePackageToken(raw);
  if (token === "basic" || token === "أساسي") return "basic";
  if (token === "pro" || token === "professional" || token === "احترافي") return "pro";
  if (token === "enterprise" || token === "مؤسسي") return "enterprise";
  if (token === "trial" || token === "تجريبي") return "trial";
  if (token === "custom" || token === "مخصص") return "custom";
  if (token === "contract" || token === "تعاقدي") return "contract";
  return token;
}

export function isCanonicalCompanyPackageKey(key: string | null): boolean {
  return Boolean(key && (CANONICAL_PACKAGE_KEYS as readonly string[]).includes(key));
}

export function companyPackageDisplaySource(
  company: Pick<Company, "subscription_plan" | "plan">,
): { key: string | null; rawLabel: string | null } {
  const key = resolveCompanyPackageKey(company);
  const plan = firstPlan(company);
  const raw =
    [plan?.display_name, plan?.name, plan?.code, company.subscription_plan]
      .map((value) => String(value ?? "").trim())
      .find((value) => value && !UUID_RE.test(value)) ?? null;
  return { key, rawLabel: key ? raw : null };
}

function matchText(
  value: string | null | undefined,
  query: string,
  mode: CompanyTextMatchMode,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = (value ?? "").trim().toLowerCase();
  if (!haystack) return false;
  return mode === "startsWith" ? haystack.startsWith(needle) : haystack.includes(needle);
}

function inInclusiveDateRange(
  iso: string | null | undefined,
  from: string | null,
  to: string | null,
): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  const day = iso.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function matchesCompanyTableFilters(
  company: Company,
  filters: CompanyTableFilters,
): boolean {
  if (!isCompaniesWorkspaceRow(company)) return false;

  const displayStatus = resolveCompanyDisplayStatus(company);
  if (filters.displayStatus !== "all" && displayStatus !== filters.displayStatus) {
    return false;
  }

  const packageKey = resolveCompanyPackageKey(company);
  if (filters.packageKey !== "all") {
    if (filters.packageKey === "none") {
      if (packageKey) return false;
    } else if (packageKey !== filters.packageKey) {
      return false;
    }
  }

  if (filters.industry !== "all" && (company.industry ?? "") !== filters.industry) {
    return false;
  }
  if (filters.businessType !== "all" && (company.business_type ?? "") !== filters.businessType) {
    return false;
  }
  if (!matchText(company.contact_person, filters.owner, "contains")) return false;
  if (!matchText(companyLocationText(company), filters.location, "contains")) return false;
  if (!matchText(company.name, filters.name.value, filters.name.mode)) return false;
  if (!matchText(company.contact_email, filters.email.value, filters.email.mode)) return false;
  if (!matchText(company.contact_phone, filters.phone.value, filters.phone.mode)) return false;

  const created = company.approval_requested_at ?? company.created_at;
  if (!inInclusiveDateRange(created, filters.createdFrom, filters.createdTo)) return false;
  if (!inInclusiveDateRange(company.updated_at, filters.updatedFrom, filters.updatedTo)) {
    return false;
  }

  const search = filters.search.trim().toLowerCase();
  if (search) {
    const haystack = [
      company.name,
      company.subscription_plan,
      firstPlan(company)?.name,
      firstPlan(company)?.code,
      company.business_type,
      company.industry,
      company.contact_email,
      company.contact_phone,
      company.contact_person,
      company.approval_status,
      companyLocationText(company),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(search)) return false;
  }

  return true;
}

function statusSortRank(status: Exclude<CompanyDisplayStatus, "all">): number {
  switch (status) {
    case "pending":
      return 0;
    case "active":
      return 1;
    case "trial":
      return 2;
    case "suspended":
      return 3;
    case "rejected":
      return 4;
    default:
      return 5;
  }
}

function compareIso(left: string | null | undefined, right: string | null | undefined): number {
  const a = left ?? "";
  const b = right ?? "";
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function compareCompaniesBySort(
  left: Company,
  right: Company,
  sort: CompanyTableSort,
): number {
  const direction = sort.direction === "asc" ? 1 : -1;
  let primary = 0;

  switch (sort.key) {
    case "name":
      primary = left.name.localeCompare(right.name, "ar");
      break;
    case "created_at":
      primary = compareIso(
        left.approval_requested_at ?? left.created_at,
        right.approval_requested_at ?? right.created_at,
      );
      break;
    case "updated_at":
      primary = compareIso(left.updated_at, right.updated_at);
      break;
    case "status":
      primary =
        statusSortRank(resolveCompanyDisplayStatus(left)) -
        statusSortRank(resolveCompanyDisplayStatus(right));
      break;
    case "package":
      primary = (resolveCompanyPackageKey(left) ?? "").localeCompare(
        resolveCompanyPackageKey(right) ?? "",
        "ar",
      );
      break;
    default:
      primary = compareIso(left.updated_at, right.updated_at);
  }

  if (primary !== 0) return primary * direction;
  const nameTie = left.name.localeCompare(right.name, "ar");
  if (nameTie !== 0) return nameTie;
  return left.id.localeCompare(right.id);
}

export function applyCompanyTableQuery(
  companies: Company[],
  filters: CompanyTableFilters,
  sort: CompanyTableSort = DEFAULT_COMPANY_TABLE_SORT,
): Company[] {
  return companies
    .filter((company) => matchesCompanyTableFilters(company, filters))
    .sort((left, right) => compareCompaniesBySort(left, right, sort));
}

export function paginateCompanyTable(
  rows: Company[],
  page: number,
  pageSize: number = COMPANY_TABLE_PAGE_SIZE,
): { page: number; totalPages: number; rows: Company[] } {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return { page: safePage, totalPages, rows: rows.slice(start, start + pageSize) };
}

export function countActiveCompanyTableFilters(filters: CompanyTableFilters): number {
  let count = 0;
  if (filters.search.trim()) count += 1;
  if (filters.displayStatus !== "all") count += 1;
  if (filters.packageKey !== "all") count += 1;
  if (filters.industry !== "all") count += 1;
  if (filters.businessType !== "all") count += 1;
  if (filters.owner.trim()) count += 1;
  if (filters.location.trim()) count += 1;
  if (filters.name.value.trim()) count += 1;
  if (filters.email.value.trim()) count += 1;
  if (filters.phone.value.trim()) count += 1;
  if (filters.createdFrom || filters.createdTo) count += 1;
  if (filters.updatedFrom || filters.updatedTo) count += 1;
  return count;
}

export function uniqueCompanyFilterValues(companies: Company[]): {
  industries: string[];
  businessTypes: string[];
  owners: string[];
  locations: string[];
} {
  const industries = new Set<string>();
  const businessTypes = new Set<string>();
  const owners = new Set<string>();
  const locations = new Set<string>();

  for (const company of companies) {
    if (!isCompaniesWorkspaceRow(company)) continue;
    if (company.industry?.trim()) industries.add(company.industry.trim());
    if (company.business_type?.trim()) businessTypes.add(company.business_type.trim());
    if (company.contact_person?.trim()) owners.add(company.contact_person.trim());
    const location = companyLocationText(company).trim();
    if (location) locations.add(location);
  }

  const collator = new Intl.Collator("ar");
  return {
    industries: [...industries].sort(collator.compare),
    businessTypes: [...businessTypes].sort(collator.compare),
    owners: [...owners].sort(collator.compare),
    locations: [...locations].sort(collator.compare),
  };
}

export function approvalStatusOf(
  company: Pick<Company, "approval_status">,
): CompanyApprovalStatus {
  return resolveCompanyApprovalStatus(company);
}
