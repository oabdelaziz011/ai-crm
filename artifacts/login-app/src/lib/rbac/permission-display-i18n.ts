import { useCallback, useEffect, useState } from "react";
import i18n from "@/i18n";
import type { PermissionRecord } from "@/hooks/use-rbac";
import enCatalog from "@/locales/en/permission-catalog.json";
import arCatalog from "@/locales/ar/permission-catalog.json";

type CatalogBundle = typeof enCatalog;

export type PermissionCatalogEntry = {
  name: string;
  description: string;
  group: string;
};

export type PermissionGroupEntry = {
  icon: string;
  order: number;
  label: string;
};

function activeCatalog(): CatalogBundle {
  const lang = i18n.resolvedLanguage ?? i18n.language ?? "en";
  return (lang.startsWith("ar") ? arCatalog : enCatalog) as CatalogBundle;
}

export function getPermissionCatalogEntry(code: string): PermissionCatalogEntry | null {
  const catalog = activeCatalog();
  const entry = catalog.codes[code as keyof typeof catalog.codes];
  if (!entry) return null;
  return {
    name: entry.name,
    description: entry.description,
    group: entry.group,
  };
}

export function inferGroupId(code: string): string {
  if (code.startsWith("customers.")) return "customers";
  if (code.startsWith("bookings.") || code.startsWith("availability.")) return "bookings";
  if (code.startsWith("invoices.")) return "invoices";
  if (code.startsWith("reports.")) return "reports";
  if (code.startsWith("dashboard.")) return "dashboard";
  if (code === "workspace.view") return "workspace";
  if (code.startsWith("billing.") || code.startsWith("subscriptions.") || code.startsWith("licenses.")) {
    return code.startsWith("licenses.") ? "licenses" : "billing";
  }
  if (code.startsWith("users.")) return "users";
  if (code.startsWith("roles.") || code.startsWith("permissions.")) return "roles";
  if (code.startsWith("companies.")) return "companies";
  if (code.startsWith("settings.")) return "settings";
  if (code.startsWith("company.")) return "company";
  if (code.startsWith("audit_logs.")) return "audit";
  if (code.startsWith("ai_assistant.")) return "aiAssistant";
  if (code.startsWith("ai_chat.")) return "aiChat";
  if (code.startsWith("ai.conversations.") || code.startsWith("conversation.")) return "conversations";
  if (code.startsWith("channels.") || code === "ai.whatsapp.manage") return "channels";
  if (code.startsWith("knowledge.") || code === "ai.knowledge.manage") return "knowledge";
  if (code.startsWith("whatsapp.")) return "whatsapp";
  if (code.startsWith("automation.") || code.startsWith("workflow.")) return "automation";
  if (code.startsWith("ai.analytics.") || code.startsWith("ai.costs.")) return "aiAnalytics";
  if (code.startsWith("leads.")) return "leads";
  if (code.startsWith("tickets.")) return "tickets";
  if (code.startsWith("products.")) return "products";
  if (code.startsWith("quotes.")) return "quotes";
  if (code.startsWith("opportunities.")) return "opportunities";
  if (code.startsWith("handoff.")) return "handoff";
  if (code.startsWith("organization.")) return "organization";
  if (code.startsWith("marketplace.")) return "marketplace";
  if (code.startsWith("integrations.")) return "integrations";
  if (code.startsWith("governance.")) return "governance";
  if (code.startsWith("configuration.")) return "configuration";
  if (code.startsWith("feature_flags.")) return "featureFlags";
  if (code.startsWith("operations.")) return "operations";
  if (code.startsWith("tasks.")) return "tasks";
  if (code.startsWith("skills.")) return "skills";
  if (code.startsWith("executive.")) return "executive";
  return "aiPlatform";
}

export function resolvePermissionDisplayName(
  code: string,
  fallback?: Pick<PermissionRecord, "description" | "action" | "module"> | null,
): string {
  const catalog = getPermissionCatalogEntry(code);
  if (catalog?.name) return catalog.name;
  if (fallback?.description) return fallback.description;
  if (fallback?.action && fallback?.module) {
    return `${fallback.action} — ${fallback.module}`;
  }
  return code;
}

export function resolvePermissionDescription(
  code: string,
  fallback?: Pick<PermissionRecord, "description"> | null,
): string {
  const catalog = getPermissionCatalogEntry(code);
  if (catalog?.description) return catalog.description;
  if (fallback?.description) return fallback.description;
  return code;
}

export function resolvePermissionGroupMeta(groupId: string): PermissionGroupEntry & { id: string } {
  const catalog = activeCatalog();
  const group = catalog.groups[groupId as keyof typeof catalog.groups];
  if (group) {
    return { id: groupId, icon: group.icon, order: group.order, label: group.label };
  }
  return { id: groupId, icon: "•", order: 999, label: groupId };
}

export function permissionSearchHaystack(
  code: string,
  permission?: PermissionRecord | null,
): string {
  const catalog = getPermissionCatalogEntry(code);
  return [
    code,
    catalog?.name,
    catalog?.description,
    permission?.description,
    permission?.action,
    permission?.module,
    permission?.category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function resolvePermissionGroupId(
  code: string,
  permission?: PermissionRecord | null,
): string {
  const catalog = getPermissionCatalogEntry(code);
  if (catalog?.group) return catalog.group;
  return inferGroupId(code);
}

export function listPermissionCatalogCodes(): string[] {
  return Object.keys(activeCatalog().codes);
}

export function usePermissionCatalogLanguageVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const handler = () => setVersion((v) => v + 1);
    i18n.on("languageChanged", handler);
    return () => {
      i18n.off("languageChanged", handler);
    };
  }, []);
  return version;
}
