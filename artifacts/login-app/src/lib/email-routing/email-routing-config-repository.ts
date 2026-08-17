import { supabase } from "@/lib/supabase";
import {
  EMAIL_ROUTING_CATEGORIES,
  isEmailRoutingCategory,
  type CompanyEmailRoutingConfig,
  type EmailRoutingCategoryConfig,
  type EmailRoutingCategoryDraft,
  type EmailRoutingConfigTargetType,
  type EmailRoutingTargetOption,
  type EmailRoutingTargetOptions,
} from "@/lib/email-routing/types";

function asTargetType(value: unknown): EmailRoutingConfigTargetType {
  if (value === "employee" || value === "queue" || value === "department") return value;
  return "department";
}

function mapOption(raw: Record<string, unknown>): EmailRoutingTargetOption {
  const fullName = typeof raw.full_name === "string" ? raw.full_name : null;
  const name =
    (typeof raw.name === "string" && raw.name.trim()) ||
    (fullName && fullName.trim()) ||
    (typeof raw.email === "string" && raw.email.trim()) ||
    "—";
  return {
    id: String(raw.id ?? ""),
    name,
    email: typeof raw.email === "string" ? raw.email : null,
  };
}

function mapCategory(raw: Record<string, unknown>): EmailRoutingCategoryConfig | null {
  const category = String(raw.category ?? "");
  if (!isEmailRoutingCategory(category)) return null;
  const targetIdRaw = raw.target_id;
  return {
    category,
    enabled: raw.enabled !== false,
    targetType: asTargetType(raw.target_type),
    targetId: typeof targetIdRaw === "string" && targetIdRaw.trim() ? targetIdRaw : null,
    updatedAt: typeof raw.updated_at === "string" ? raw.updated_at : null,
  };
}

function defaultCategories(): EmailRoutingCategoryConfig[] {
  return EMAIL_ROUTING_CATEGORIES.map((category) => ({
    category,
    enabled: true,
    targetType: "department",
    targetId: null,
    updatedAt: null,
  }));
}

function mapTargetOptions(raw: unknown): EmailRoutingTargetOptions {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const departments = Array.isArray(record.departments)
    ? record.departments.map((item) => mapOption((item ?? {}) as Record<string, unknown>)).filter((o) => o.id)
    : [];
  const employees = Array.isArray(record.employees)
    ? record.employees.map((item) => mapOption((item ?? {}) as Record<string, unknown>)).filter((o) => o.id)
    : [];
  const queues = Array.isArray(record.queues)
    ? record.queues.map((item) => mapOption((item ?? {}) as Record<string, unknown>)).filter((o) => o.id)
    : [];
  return { departments, employees, queues };
}

function mapConfig(payload: unknown): CompanyEmailRoutingConfig {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const mapped = Array.isArray(record.categories)
    ? record.categories
        .map((item) => mapCategory((item ?? {}) as Record<string, unknown>))
        .filter((item): item is EmailRoutingCategoryConfig => Boolean(item))
    : [];

  const byCategory = new Map(mapped.map((item) => [item.category, item]));
  const categories = EMAIL_ROUTING_CATEGORIES.map(
    (category) => byCategory.get(category) ?? defaultCategories().find((d) => d.category === category)!,
  );

  return {
    companyId: typeof record.company_id === "string" ? record.company_id : "",
    canEdit: record.can_edit === true,
    categories,
    targetOptions: mapTargetOptions(record.target_options),
  };
}

export class EmailRoutingConfigRepository {
  async getMyConfig(): Promise<CompanyEmailRoutingConfig> {
    const { data, error } = await supabase.rpc("get_my_company_email_routing_config");
    if (error) throw new Error(error.message);
    return mapConfig(data);
  }

  async upsertMyConfig(categories: EmailRoutingCategoryDraft[]): Promise<CompanyEmailRoutingConfig> {
    const payload = categories.map((item) => ({
      category: item.category,
      enabled: item.enabled,
      target_type: item.targetType,
      target_id: item.targetId,
    }));
    const { data, error } = await supabase.rpc("upsert_my_company_email_routing_config", {
      p_categories: payload,
    });
    if (error) throw new Error(error.message);
    return mapConfig(data);
  }
}

export const emailRoutingConfigRepository = new EmailRoutingConfigRepository();
