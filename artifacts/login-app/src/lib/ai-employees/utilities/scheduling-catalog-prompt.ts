import type { SupabaseClient } from "@supabase/supabase-js";

type CatalogRow = Readonly<{ id: string; name: string }>;

async function listActiveServices(client: SupabaseClient, companyId: string): Promise<CatalogRow[]> {
  const { data, error } = await client
    .from("scheduling_services")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name")
    .limit(50);

  if (error) return [];
  return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) }));
}

async function listActiveResources(client: SupabaseClient, companyId: string): Promise<CatalogRow[]> {
  const { data, error } = await client
    .from("scheduling_resources")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name")
    .limit(50);

  if (error) return [];
  return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) }));
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
    .filter((row) => {
      const service = row.scheduling_services as { status?: string; deleted_at?: string | null } | null;
      const resource = row.scheduling_resources as { status?: string; deleted_at?: string | null } | null;
      return (
        service?.status === "active" &&
        !service?.deleted_at &&
        resource?.status === "active" &&
        !resource?.deleted_at
      );
    })
    .map((row) => {
      const service = row.scheduling_services as { id: string; name: string };
      const resource = row.scheduling_resources as { id: string; name: string };
      return {
        serviceId: String(service.id),
        serviceName: String(service.name),
        resourceId: String(resource.id),
        resourceName: String(resource.name),
      };
    });
}

export async function buildSchedulingCatalogPromptAddon(
  client: SupabaseClient,
  companyId: string,
): Promise<string | null> {
  const [services, resources, links] = await Promise.all([
    listActiveServices(client, companyId),
    listActiveResources(client, companyId),
    listServiceResourceLinks(client, companyId),
  ]);

  if (services.length === 0) return null;

  const serviceLines = services.map((service) => `- ${service.name}: serviceId=${service.id}`).join("\n");
  const resourceLines =
    resources.length > 0
      ? resources.map((resource) => `- ${resource.name}: resourceId=${resource.id}`).join("\n")
      : "- (none configured)";
  const linkLines =
    links.length > 0
      ? links
          .map(
            (link) =>
              `- ${link.resourceName} offers ${link.serviceName} (serviceId=${link.serviceId}, resourceId=${link.resourceId})`,
          )
          .join("\n")
      : "- (none configured)";

  return [
    "SCHEDULING CATALOG — always pass these exact UUIDs to search_availability / find_next_available / recommend_appointment / create_booking:",
    "Services:",
    serviceLines,
    "Resources:",
    resourceLines,
    "Service ↔ resource links:",
    linkLines,
    "When the customer names a service from this catalog, use that serviceId immediately. Do not ask again for service type.",
    "For recommendation intent (اقترح / أنسب ميعاد / recommend), call recommend_appointment with the matched serviceId. Say clearly it is a recommendation only — not a confirmed booking — and do not call create_booking unless the customer explicitly asks to book.",
    "Tool choice: booking_search = CRM trusted-customer booking history (سجل الحجوزات). search_bookings = phone/operational list for cancel/reschedule/check-in/check-out.",
    "Tool choice: find_next_available = nearest/earliest one slot (أقرب موعد / earliest available). search_availability = list slots for a date/window (المواعيد المتاحة يوم …).",
    "When the customer asks to book with a named resource from this catalog, call search_availability immediately with the linked serviceId and resourceId.",
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
