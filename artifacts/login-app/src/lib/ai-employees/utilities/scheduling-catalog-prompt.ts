import type { SupabaseClient } from "@supabase/supabase-js";
import { readEmbeddedRow } from "@workspace/ai-tool-router";

/** Tools that require service/resource UUID catalog text in the system prompt. */
export const SCHEDULING_CATALOG_TOOL_KEYS = [
  "search_availability",
  "find_next_available",
  "recommend_appointment",
  "create_booking",
  "search_bookings",
  "reschedule_booking",
  "cancel_booking",
  "check_in",
  "check_out",
  "list_demo_types",
  "search_demo_availability",
  "find_next_demo",
  "create_demo_booking",
] as const;

/** Tools that receive CRITICAL BOOKING ACTION RULES (includes read-only CRM history). */
export const SCHEDULING_ACTION_TOOL_KEYS = [
  ...SCHEDULING_CATALOG_TOOL_KEYS,
  "booking_search",
] as const;

export function employeeHasSchedulingCatalogTools(enabledToolKeys: readonly string[]): boolean {
  const enabled = new Set(enabledToolKeys.map((key) => key.trim()).filter(Boolean));
  return SCHEDULING_CATALOG_TOOL_KEYS.some((key) => enabled.has(key));
}

export function employeeHasSchedulingActionTools(enabledToolKeys: readonly string[]): boolean {
  const enabled = new Set(enabledToolKeys.map((key) => key.trim()).filter(Boolean));
  return SCHEDULING_ACTION_TOOL_KEYS.some((key) => enabled.has(key));
}

export async function resolveSchedulingCatalogPromptForEmployee(
  client: SupabaseClient,
  companyId: string,
  enabledToolKeys: readonly string[],
): Promise<string | null> {
  if (!employeeHasSchedulingCatalogTools(enabledToolKeys)) return null;
  return buildSchedulingCatalogPromptAddon(client, companyId);
}

type CatalogRow = Readonly<{ id: string; name: string; serviceKind: "operational" | "sales_demo" }>;
type CatalogResourceRow = Readonly<{
  id: string;
  name: string;
  resourceType: string;
  branchId: string | null;
}>;
type CatalogBranchRow = Readonly<{ id: string; name: string }>;

type ProductDemoCatalogRow = Readonly<{
  offeringId: string;
  catalogProductId: string;
  title: string;
  durationMinutes: number;
}>;

/**
 * Published product-demo offerings. serviceId for demo tools is the catalog product id,
 * the same id list_demo_types returns. Clinic scheduling_services are not demo targets.
 */
async function listPublishedProductDemoOfferings(
  client: SupabaseClient,
  companyId: string,
): Promise<ProductDemoCatalogRow[]> {
  const { data, error } = await client
    .from("product_demo_offerings")
    .select("id, title, catalog_product_id, duration_minutes")
    .eq("company_id", companyId)
    .eq("status", "published")
    .is("deleted_at", null)
    .order("title")
    .limit(50);

  if (error) return [];
  return (data ?? [])
    .map((row) => {
      const catalogProductId = String(row.catalog_product_id ?? "").trim();
      if (!catalogProductId) return null;
      const duration = Number(row.duration_minutes);
      return {
        offeringId: String(row.id),
        catalogProductId,
        title: String(row.title ?? "").trim() || catalogProductId,
        durationMinutes: Number.isFinite(duration) && duration > 0 ? duration : 30,
      };
    })
    .filter((row): row is ProductDemoCatalogRow => row != null);
}

async function listActiveServices(client: SupabaseClient, companyId: string): Promise<CatalogRow[]> {
  const { data, error } = await client
    .from("scheduling_services")
    .select("id, name, service_kind")
    .eq("company_id", companyId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name")
    .limit(50);

  if (error) return [];
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    serviceKind:
      String((row as { service_kind?: string }).service_kind ?? "operational") === "sales_demo"
        ? "sales_demo"
        : "operational",
  }));
}

async function listActiveBranches(client: SupabaseClient, companyId: string): Promise<CatalogBranchRow[]> {
  const { data, error } = await client
    .from("branches")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name")
    .limit(50);

  if (error) return [];
  return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) }));
}

async function listActiveResources(client: SupabaseClient, companyId: string): Promise<CatalogResourceRow[]> {
  const { data, error } = await client
    .from("scheduling_resources")
    .select("id, name, resource_type, branch_id")
    .eq("company_id", companyId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name")
    .limit(50);

  if (error) return [];
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    resourceType: String(row.resource_type ?? "other"),
    branchId: row.branch_id ? String(row.branch_id) : null,
  }));
}

async function listServiceResourceLinks(
  client: SupabaseClient,
  companyId: string,
): Promise<Array<{ serviceId: string; serviceName: string; resourceId: string; resourceName: string }>> {
  const { data, error } = await client
    .from("resource_services")
    .select(
      "service_id, resource_id, scheduling_services!inner(id, name, status, deleted_at), scheduling_resources!inner(id, name, status, deleted_at)",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .limit(100);

  if (error) return [];
  return (data ?? [])
    .map((row) => {
      const service = readEmbeddedRow(
        row.scheduling_services as
          | { id: string; name: string; status?: string; deleted_at?: string | null }
          | Array<{ id: string; name: string; status?: string; deleted_at?: string | null }>
          | null
          | undefined,
      );
      const resource = readEmbeddedRow(
        row.scheduling_resources as
          | { id: string; name: string; status?: string; deleted_at?: string | null }
          | Array<{ id: string; name: string; status?: string; deleted_at?: string | null }>
          | null
          | undefined,
      );
      if (
        !service ||
        !resource ||
        service.status !== "active" ||
        service.deleted_at ||
        resource.status !== "active" ||
        resource.deleted_at
      ) {
        return null;
      }
      return {
        serviceId: String(service.id),
        serviceName: String(service.name),
        resourceId: String(resource.id),
        resourceName: String(resource.name),
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        serviceId: string;
        serviceName: string;
        resourceId: string;
        resourceName: string;
      } => entry != null,
    );
}

function majorPriceAmount(cents: number): string {
  if (!Number.isFinite(cents)) return "";
  const major = cents / 100;
  return Number.isInteger(major) ? String(major) : major.toFixed(2);
}

const PRICE_TYPE_LABELS: Record<string, string> = {
  New: "جديد",
  FollowUp: "متابعة",
  "Follow Up": "متابعة",
  Consultation: "استشارة",
  Emergency: "طوارئ",
  VIP: "VIP",
};

function priceTypeLabel(code: string, label: string): string {
  return PRICE_TYPE_LABELS[code] ?? PRICE_TYPE_LABELS[label] ?? (label || code);
}

async function listServicePriceLines(client: SupabaseClient, companyId: string): Promise<string[]> {
  const { data, error } = await client
    .from("scheduling_service_pricing_rules")
    .select(
      "price_cents, currency, scheduling_services!inner(name, status, deleted_at), scheduling_pricing_rule_types!inner(code, label, active)",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .limit(100);

  if (error || !data) return [];
  const lines: string[] = [];
  for (const row of data) {
    const service = readEmbeddedRow(
      row.scheduling_services as { name?: string; status?: string; deleted_at?: string | null } | Array<{ name?: string; status?: string; deleted_at?: string | null }> | null,
    );
    const ruleType = readEmbeddedRow(
      row.scheduling_pricing_rule_types as { code?: string; label?: string; active?: boolean } | Array<{ code?: string; label?: string; active?: boolean }> | null,
    );
    if (!service || !ruleType || service.status !== "active" || service.deleted_at || ruleType.active === false) {
      continue;
    }
    const cents = Number(row.price_cents);
    const code = String(ruleType.code ?? "").trim();
    const savedLabel = String(ruleType.label ?? "").trim();
    const amount = majorPriceAmount(cents);
    const currency = String(row.currency ?? "").trim().toUpperCase();
    const name = String(service.name ?? "").trim();
    const label = priceTypeLabel(code, savedLabel).replace(/\s+/g, " ");
    if (!code || !name || !amount || !currency || cents <= 0) continue;
    lines.push(`- service=${name} kind=${code} label=${label} amount=${amount} currency=${currency}`);
  }
  return lines;
}

export async function buildSchedulingCatalogPromptAddon(
  client: SupabaseClient,
  companyId: string,
): Promise<string | null> {
  const [services, productDemos, branches, resources, links, priceLines] = await Promise.all([
    listActiveServices(client, companyId),
    listPublishedProductDemoOfferings(client, companyId),
    listActiveBranches(client, companyId),
    listActiveResources(client, companyId),
    listServiceResourceLinks(client, companyId),
    listServicePriceLines(client, companyId),
  ]);

  const operationalServices = services.filter((service) => service.serviceKind === "operational");
  if (operationalServices.length === 0 && productDemos.length === 0) return null;

  const operationalIds = new Set(operationalServices.map((service) => service.id));
  const clinicSalesDemoIds = new Set(
    services.filter((service) => service.serviceKind === "sales_demo").map((service) => service.id),
  );

  const operationalServiceLines =
    operationalServices.length > 0
      ? operationalServices.map((service) => `- ${service.name}: serviceId=${service.id}`).join("\n")
      : "- (none configured)";
  const demoServiceLines =
    productDemos.length > 0
      ? productDemos
          .map(
            (demo) =>
              `- ${demo.title}: serviceId=${demo.catalogProductId} offeringId=${demo.offeringId} durationMinutes=${demo.durationMinutes}`,
          )
          .join("\n")
      : "- (none configured)";
  const branchLines =
    branches.length > 0
      ? branches.map((branch) => `- ${branch.name}: branchId=${branch.id}`).join("\n")
      : "- (none configured)";
  const resourceLines =
    resources.length > 0
      ? resources
          .map((resource) => {
            const branchPart = resource.branchId ? ` branchId=${resource.branchId}` : "";
            return `- ${resource.name}: resourceId=${resource.id} role=${resource.resourceType}${branchPart}`;
          })
          .join("\n")
      : "- (none configured)";
  const operationalLinks = links.filter(
    (link) => operationalIds.has(link.serviceId) && !clinicSalesDemoIds.has(link.serviceId),
  );
  const linkLines =
    operationalLinks.length > 0
      ? operationalLinks
          .map(
            (link) =>
              `- ${link.resourceName} offers ${link.serviceName} (serviceId=${link.serviceId}, resourceId=${link.resourceId})`,
          )
          .join("\n")
      : "- (none configured)";
  const demoLinkLines =
    "- Presenters are returned by search_demo_availability and find_next_demo. Do not pass a clinic resourceId.";

  return [
    "SCHEDULING CATALOG — keep operational clinic services and sales demos separate. Never book a clinic/service UUID with create_demo_booking, and never book a sales_demo UUID with create_booking.",
    "Operational services (clinic/service appointments — use search_availability / find_next_available / recommend_appointment / create_booking; resourceId is required on create_booking):",
    operationalServiceLines,
    "Sales demo types (published product-demo offerings — serviceId is the catalog product id returned by list_demo_types; use it with search_demo_availability / find_next_demo / create_demo_booking):",
    demoServiceLines,
    "Branches:",
    branchLines,
    "Resources:",
    resourceLines,
    "Operational service ↔ resource links:",
    linkLines,
    "Sales demo ↔ resource links:",
    demoLinkLines,
    ...(priceLines.length > 0 ? ["Prices:", ...priceLines] : []),
    "Booking order (operational): if the customer has not named a service, ask which service. If that service has more than one priced visit type, ask which type. If more than one branch offers that service, ask which branch (pass branchId). If zero or one branch, do not ask about branch. Then call find_next_available for one nearest slot. Do not list a day with all of its hours.",
    "Demo order: if scheduling a product/sales demo, use list_demo_types then find_next_demo / create_demo_booking with a serviceId from Sales demo types only. Never use a clinic scheduling_services id.",
    "For recommendation intent (اقترح / أنسب ميعاد / recommend), call recommend_appointment with the matched operational serviceId. Say clearly it is a recommendation only — not a confirmed booking — and do not call create_booking unless the customer explicitly asks to book.",
    "Tool choice: booking_search = CRM trusted-customer booking history (سجل الحجوزات). search_bookings = phone/operational list for cancel/reschedule/check-in/check-out.",
    "Tool choice: find_next_available = nearest/earliest one operational slot. search_availability = list operational slots for a date/window. find_next_demo / search_demo_availability = sales demos only.",
    "When the customer names a provider, still ask for the service and the priced visit type before any availability call. find_next_available is the first slot only. search_availability is only for other days after that nearest slot.",
  ].join("\n");
}


export function appendSchedulingCatalogPrompt(
  pageContext: Record<string, unknown>,
): Record<string, unknown> {
  const addon = pageContext.schedulingCatalogPrompt;
  if (typeof addon !== "string" || !addon.trim()) return pageContext;

  const existing =
    (typeof pageContext.systemPrompt === "string" && pageContext.systemPrompt) || "";
  if (existing.includes("SCHEDULING CATALOG")) return pageContext;

  return {
    ...pageContext,
    systemPrompt: [existing.trim(), addon.trim()].filter(Boolean).join("\n\n"),
  };
}
