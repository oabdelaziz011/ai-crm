import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchChannelWorkflowBinding, saveChannelWorkflowBinding } from "@/lib/channel-workflow-binding/channel-workflow-binding-repository";
import { hasCompanyFeature } from "@/lib/billing/company-feature-entitlement-service";
import {
  defaultWebsiteContent,
  defaultWebsiteSections,
  emptyWebsiteGallery,
  planWebsiteSave,
  readWebsiteSections,
  sanitizeWebsiteContent,
  sanitizeWebsiteGallery,
  type WebsitePublishBlocker,
  type WebsiteContent,
  type WebsiteGallery,
  type WebsiteSaveInput,
  type WebsiteSavePlan,
  type WebsiteSections,
} from "./website-model.js";

export type WebsiteEmployeeOption = {
  id: string;
  name: string;
};

export type WebsiteStudioSnapshot = {
  portalId: string | null;
  portalWasEnabled: boolean;
  slug: string;
  pageId: string | null;
  published: boolean;
  sections: WebsiteSections;
  headline: string;
  description: string;
  widgetId: string | null;
  greeting: string;
  aiEnabled: boolean;
  aiEmployeeId: string | null;
  publicKey: string | null;
  pageFeature: boolean;
  chatFeature: boolean;
  employees: WebsiteEmployeeOption[];
  gallery: WebsiteGallery;
  content: WebsiteContent;
};

export class WebsiteStudioError extends Error {
  constructor(readonly blockers: WebsitePublishBlocker[]) {
    super(blockers.join(","));
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function loadWebsiteStudio(
  client: SupabaseClient,
  companyId: string,
): Promise<WebsiteStudioSnapshot> {
  const [portalResult, pageResult, widgetResult, employeeResult, pageFeature, chatFeature] = await Promise.all([
    client
      .from("customer_portal_settings")
      .select("id, slug, enabled, description")
      .eq("company_id", companyId)
      .maybeSingle(),
    client
      .from("web_presence_pages")
      .select("id, published, sections, headline_override, description_override, widget_id, gallery, content")
      .eq("company_id", companyId)
      .maybeSingle(),
    client
      .from("web_chat_widgets")
      .select("id, greeting, enabled, ai_employee_id, config, public_key")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(1),
    client
      .from("ai_employees")
      .select("id, name, display_name")
      .eq("company_id", companyId)
      .eq("status", "published")
      .not("published_version_id", "is", null)
      .is("deleted_at", null)
      .order("name"),
    hasCompanyFeature(companyId, "web_presence_page"),
    hasCompanyFeature(companyId, "web_chat_widget"),
  ]);

  if (portalResult.error) throw new Error(portalResult.error.message);
  if (pageResult.error) throw new Error(pageResult.error.message);
  if (widgetResult.error) throw new Error(widgetResult.error.message);
  if (employeeResult.error) throw new Error(employeeResult.error.message);

  const portal = portalResult.data;
  const page = pageResult.data;
  const widget = widgetResult.data?.[0] ?? null;
  const config = asRecord(widget?.config);
  return {
    portalId: portal?.id ?? null,
    portalWasEnabled: portal?.enabled === true,
    slug: portal?.slug ?? "",
    pageId: page?.id ?? null,
    published: page?.published === true,
    sections: readWebsiteSections(page?.sections ?? defaultWebsiteSections()),
    headline: page?.headline_override ?? "",
    description: page?.description_override ?? portal?.description ?? "",
    widgetId: page?.widget_id ?? widget?.id ?? null,
    greeting: widget?.greeting ?? "",
    aiEnabled: config.aiEnabled !== false,
    aiEmployeeId: widget?.ai_employee_id ?? null,
    publicKey: widget?.public_key ?? null,
    pageFeature,
    chatFeature,
    gallery: sanitizeWebsiteGallery(page?.gallery ?? emptyWebsiteGallery()),
    content: sanitizeWebsiteContent(page?.content ?? defaultWebsiteContent()),
    employees: (await conversationPromptReady(client, companyId))
      ? (employeeResult.data ?? []).map((row) => ({
          id: row.id,
          name: row.display_name?.trim() || row.name,
        }))
      : [],
  };
}

async function conversationPromptReady(client: SupabaseClient, companyId: string): Promise<boolean> {
  const templates = await client
    .from("prompt_templates")
    .select("active_version_id")
    .eq("company_id", companyId)
    .eq("template_type", "conversation")
    .eq("is_enabled", true);
  if (templates.error || !templates.data?.length) return false;
  const ids = templates.data
    .map((row) => row.active_version_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (ids.length === 0) return false;
  const versions = await client.from("prompt_template_versions").select("id").in("id", ids);
  if (versions.error) return false;
  return (versions.data?.length ?? 0) > 0;
}

async function ensurePortal(
  client: SupabaseClient,
  companyId: string,
  plan: WebsiteSavePlan,
): Promise<string> {
  if (plan.portal.id) {
    const { error } = await client
      .from("customer_portal_settings")
      .update({ slug: plan.portal.slug, enabled: plan.portal.enabled })
      .eq("id", plan.portal.id)
      .eq("company_id", companyId);
    if (error?.code === "23505") throw new WebsiteStudioError(["slug_taken"]);
    if (error) throw new Error(error.message);
    return plan.portal.id;
  }
  const { data, error } = await client
    .from("customer_portal_settings")
    .insert({
      company_id: companyId,
      slug: plan.portal.slug,
      enabled: plan.portal.enabled,
      description: plan.page.description,
    })
    .select("id")
    .single();
  if (error?.code === "23505") throw new WebsiteStudioError(["slug_taken"]);
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function ensureWidget(
  client: SupabaseClient,
  companyId: string,
  plan: WebsiteSavePlan,
): Promise<string | null> {
  const widget = plan.widget;
  if (!widget) return plan.page.widgetId;
  let widgetId = widget.id;
  if (widget.provision) {
    const { data, error } = await client.rpc("web_presence_provision_widget", {
      p_company_id: companyId,
      p_name: "Website chat",
    });
    if (error) throw new Error(error.message);
    if (typeof data !== "string") throw new Error("website_widget_unavailable");
    widgetId = data;
  }
  if (!widgetId) return null;
  const { data: current, error: readError } = await client
    .from("web_chat_widgets")
    .select("config")
    .eq("id", widgetId)
    .eq("company_id", companyId)
    .single();
  if (readError) throw new Error(readError.message);
  const config = { ...asRecord(current?.config), aiEnabled: widget.aiEnabled };
  const patch: Record<string, unknown> = {
    enabled: widget.enabled,
    greeting: widget.greeting,
    ai_employee_id: widget.aiEmployeeId,
    config,
  };
  if (widget.allowedOrigins.length > 0) patch.allowed_origins = widget.allowedOrigins;
  const { error } = await client.from("web_chat_widgets").update(patch).eq("id", widgetId).eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return widgetId;
}

async function syncWebsiteChatResponder(
  client: SupabaseClient,
  companyId: string,
  widgetId: string | null,
  chat: WebsiteContent["chat"],
  chatSection: boolean,
  published: boolean,
) {
  if (!widgetId) return;
  const { data, error } = await client
    .from("web_chat_widgets")
    .select("company_channel_id")
    .eq("id", widgetId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const channelId = data?.company_channel_id;
  if (!channelId) return;
  const workflowId = chat.responseMode === "workflow" ? chat.workflowId : null;
  if (published && chatSection && chat.responseMode === "workflow") {
    if (!workflowId) throw new WebsiteStudioError(["workflow_required"]);
    const flow = await client
      .from("automation_flows")
      .select("id")
      .eq("id", workflowId)
      .eq("company_id", companyId)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle();
    if (flow.error) throw new Error(flow.error.message);
    if (!flow.data) throw new WebsiteStudioError(["workflow_required"]);
  }
  const existing = await fetchChannelWorkflowBinding(client, channelId);
  const workflowOn = published && chatSection && chat.responseMode === "workflow" && Boolean(workflowId);
  await saveChannelWorkflowBinding(client, {
    companyId,
    companyChannelId: channelId,
    workflowEnabled: workflowOn,
    automationFlowId: workflowId,
    existingBinding: existing,
  });
}

export async function saveWebsiteStudio(
  client: SupabaseClient,
  companyId: string,
  input: WebsiteSaveInput,
): Promise<void> {
  const planned = planWebsiteSave(input);
  if (!planned.ok) throw new WebsiteStudioError(planned.blockers);
  const available = await client.rpc("website_slug_available", {
    p_company_id: companyId,
    p_slug: planned.plan.portal.slug,
  });
  if (available.error) throw new Error(available.error.message);
  if (available.data !== true) throw new WebsiteStudioError(["slug_taken"]);
  if (
    planned.plan.page.published
    && planned.plan.page.sections.chat
    && planned.plan.page.content.chat.responseMode === "ai_employee"
  ) {
    const employeeId = planned.plan.widget?.aiEmployeeId;
    if (!employeeId) throw new WebsiteStudioError(["ai_employee_required"]);
    const employee = await client
      .from("ai_employees")
      .select("id")
      .eq("id", employeeId)
      .eq("company_id", companyId)
      .eq("status", "published")
      .not("published_version_id", "is", null)
      .is("deleted_at", null)
      .maybeSingle();
    if (employee.error) throw new Error(employee.error.message);
    if (!employee.data || !(await conversationPromptReady(client, companyId))) {
      throw new WebsiteStudioError(["ai_employee_required"]);
    }
  }
  const portalId = await ensurePortal(client, companyId, planned.plan);
  const widgetId = await ensureWidget(client, companyId, planned.plan);
  await syncWebsiteChatResponder(
    client,
    companyId,
    widgetId,
    planned.plan.page.content.chat,
    planned.plan.page.sections.chat,
    planned.plan.page.published,
  );
  const page = planned.plan.page;
  const row = {
    company_id: companyId,
    portal_settings_id: portalId,
    widget_id: widgetId,
    enabled: page.enabled,
    published: page.published,
    sections: page.sections,
    headline_override: page.headline,
    description_override: page.description,
    gallery: page.gallery,
    content: page.content,
    contact_form: { enabled: page.sections.contact },
  };
  if (page.id) {
    const { data, error } = await client.from("web_presence_pages").update(row).eq("id", page.id).eq("company_id", companyId).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("The draft was not saved.");
    return;
  }
  const { error } = await client.from("web_presence_pages").insert(row);
  if (error) throw new Error(error.message);
}
