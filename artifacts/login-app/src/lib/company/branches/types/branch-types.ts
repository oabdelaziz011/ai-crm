import type { Branch, BranchStatus } from "@/lib/scheduling/types";

export type BranchRecord = Branch;

export type BranchInsert = {
  company_id: string;
  name: string;
  code?: string | null;
  timezone: string;
  status?: BranchStatus;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  email?: string | null;
  is_primary?: boolean;
  created_by?: string | null;
  updated_by?: string | null;
};

export type BranchUpdate = Partial<
  Omit<BranchInsert, "company_id" | "created_by">
>;

export type BranchFormValues = {
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  phone: string;
  email: string;
  timezone: string;
  is_primary: boolean;
  status: BranchStatus;
};

export type BranchStats = {
  branches: number;
  users: number;
  resources: number;
  services: number;
};

export type BranchWithStats = BranchRecord & {
  users_count: number;
  resources_count: number;
  services_count: number;
};

export type BranchDependencyCounts = {
  users: number;
  resources: number;
  bookings: number;
};

export type UserBranchAssignment = {
  id: string;
  company_id: string;
  user_id: string;
  branch_id: string;
  created_at: string;
};

export type BranchListFilter = {
  status?: BranchStatus | "all";
  search?: string;
};

export type BranchListPage = {
  items: BranchWithStats[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type { BranchStatus };
