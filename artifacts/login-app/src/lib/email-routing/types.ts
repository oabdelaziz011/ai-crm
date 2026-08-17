import {
  EMAIL_ROUTING_CATEGORIES,
  isEmailRoutingCategory,
  type EmailRoutingCategory,
} from "./email-routing-categories";

export type EmailRoutingConfigTargetType = "department" | "employee" | "queue";

export type EmailRoutingCategoryConfig = {
  category: EmailRoutingCategory;
  enabled: boolean;
  targetType: EmailRoutingConfigTargetType;
  targetId: string | null;
  updatedAt?: string | null;
};

export type EmailRoutingTargetOption = {
  id: string;
  name: string;
  email?: string | null;
};

export type EmailRoutingTargetOptions = {
  departments: EmailRoutingTargetOption[];
  employees: EmailRoutingTargetOption[];
  queues: EmailRoutingTargetOption[];
};

export type CompanyEmailRoutingConfig = {
  companyId: string;
  canEdit: boolean;
  categories: EmailRoutingCategoryConfig[];
  targetOptions: EmailRoutingTargetOptions;
};

export type EmailRoutingCategoryDraft = {
  category: EmailRoutingCategory;
  enabled: boolean;
  targetType: EmailRoutingConfigTargetType;
  targetId: string | null;
};

export { EMAIL_ROUTING_CATEGORIES, isEmailRoutingCategory };
export type { EmailRoutingCategory };
