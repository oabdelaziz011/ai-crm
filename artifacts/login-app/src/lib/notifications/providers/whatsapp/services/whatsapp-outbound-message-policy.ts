/**
 * Resolves whether an outbound WhatsApp send should use session freeform text
 * or an approved Meta template. Never substitutes hello_world for transactional
 * purposes. Never falls back to Email.
 */

import {
  WHATSAPP_PURPOSE_TEMPLATE_SPECS,
  type CompanyWhatsAppTemplateBindings,
  type WhatsAppMessagePurpose,
} from "@/lib/notifications/providers/whatsapp/templates/whatsapp-purpose-templates";
import { WhatsAppTemplateConfigurationError } from "@/lib/notifications/providers/whatsapp/services/whatsapp-template-configuration-error";

export type MetaApprovedTemplateRecord = {
  name: string;
  language: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "DISABLED" | "PAUSED" | string;
};

/** Company DB row used for outbound resolution — Meta status is source of truth. */
export type CompanyTemplateOutboundRecord = {
  purposeKey: string;
  metaTemplateName: string;
  languageCode: string;
  metaStatus: string;
};

export type WhatsAppOutboundFreeformPlan = {
  mode: "freeform_text";
  text: string;
  templateKey: null;
  templateId: null;
  languageCode: string;
  bodyParameters: [];
};

export type WhatsAppOutboundTemplatePlan = {
  mode: "template";
  purpose: WhatsAppMessagePurpose;
  text: string;
  templateKey: string;
  templateId: string;
  languageCode: string;
  bodyParameters: string[];
};

export type WhatsAppOutboundPlan = WhatsAppOutboundFreeformPlan | WhatsAppOutboundTemplatePlan;

const BLOCKED_TRANSACTIONAL_TEMPLATES = new Set(["generic_system", "generic_system_ar"]);

function normalizeLanguage(code: string): string {
  return code.trim().replace("-", "_") || "en_US";
}

function languageMatches(requested: string, available: string): boolean {
  const a = normalizeLanguage(requested).toLowerCase();
  const b = normalizeLanguage(available).toLowerCase();
  if (a === b) return true;
  const aBase = a.split("_")[0] ?? a;
  const bBase = b.split("_")[0] ?? b;
  return aBase === bBase;
}

function resolveBinding(
  purpose: WhatsAppMessagePurpose,
  bindings: CompanyWhatsAppTemplateBindings,
) {
  const spec = WHATSAPP_PURPOSE_TEMPLATE_SPECS[purpose];
  const binding = bindings[purpose];
  return {
    spec,
    metaName: (binding?.metaName ?? spec.recommendedMetaName).trim(),
    language: normalizeLanguage(binding?.language ?? spec.language),
    approvalStatus: binding?.approvalStatus ?? ("pending" as const),
  };
}

function assertTemplateAllowed(
  purpose: WhatsAppMessagePurpose,
  metaName: string,
): void {
  const lower = metaName.toLowerCase();
  if (BLOCKED_TRANSACTIONAL_TEMPLATES.has(lower)) {
    throw new WhatsAppTemplateConfigurationError(
      "generic_system_blocked",
      `Template "${metaName}" is blocked. Create and approve a purpose-specific Meta template instead of generic_system.`,
      { purpose, metaName },
    );
  }
  const spec = WHATSAPP_PURPOSE_TEMPLATE_SPECS[purpose];
  if (lower === "hello_world" && !spec.allowsHelloWorld) {
    throw new WhatsAppTemplateConfigurationError(
      "hello_world_not_allowed",
      `hello_world cannot be used for purpose "${purpose}". Use a transactional UTILITY template.`,
      { purpose, metaName },
    );
  }
}

function assertApprovedAgainstMetaCatalog(
  metaName: string,
  language: string,
  purpose: WhatsAppMessagePurpose,
  approvedTemplates: MetaApprovedTemplateRecord[] | null | undefined,
): void {
  if (!approvedTemplates) return;
  const languageMatchesForName = approvedTemplates.filter(
    (t) => t.name === metaName && languageMatches(language, t.language),
  );
  const approvedMatch = languageMatchesForName.find(
    (t) => String(t.status).toUpperCase() === "APPROVED",
  );
  if (approvedMatch) return;

  if (languageMatchesForName.length > 0) {
    throw new WhatsAppTemplateConfigurationError(
      "template_not_approved",
      `Template "${metaName}" (${language}) exists on the WABA but status is not APPROVED for purpose "${purpose}".`,
      { purpose, metaName, language },
    );
  }

  const sameName = approvedTemplates.filter((t) => t.name === metaName);
  if (sameName.length > 0) {
    throw new WhatsAppTemplateConfigurationError(
      "template_language_mismatch",
      `Template "${metaName}" exists on the WABA but not for language "${language}".`,
      { purpose, metaName, language },
    );
  }

  throw new WhatsAppTemplateConfigurationError(
    "template_not_approved",
    `Template "${metaName}" (${language}) is not APPROVED on this WABA for purpose "${purpose}".`,
    { purpose, metaName, language },
  );
}

function buildBodyParameters(
  purpose: WhatsAppMessagePurpose,
  params: Record<string, string>,
): string[] {
  const spec = WHATSAPP_PURPOSE_TEMPLATE_SPECS[purpose];
  const missing = spec.variableKeys.filter((key) => !String(params[key] ?? "").trim());
  if (missing.length > 0) {
    throw new WhatsAppTemplateConfigurationError(
      "template_params_invalid",
      `Missing required template parameters for "${purpose}": ${missing.join(", ")}`,
      { purpose },
    );
  }
  return spec.variableKeys.map((key) => String(params[key] ?? "").trim());
}

/** Session freeform — only when Meta customer-care window is open. */
export function planSessionFreeformText(input: {
  text: string;
  sessionWindowOpen: boolean;
  languageCode?: string;
}): WhatsAppOutboundFreeformPlan {
  const text = input.text.trim();
  if (!text) {
    throw new WhatsAppTemplateConfigurationError(
      "template_params_invalid",
      "Message text is required for freeform WhatsApp send.",
    );
  }
  if (!input.sessionWindowOpen) {
    throw new WhatsAppTemplateConfigurationError(
      "session_window_closed_no_template",
      "Meta 24-hour messaging window is closed. Freeform text is not allowed; use an approved purpose template.",
    );
  }
  return {
    mode: "freeform_text",
    text,
    templateKey: null,
    templateId: null,
    languageCode: normalizeLanguage(input.languageCode ?? "en_US"),
    bodyParameters: [],
  };
}

/**
 * Purpose template — prefers company_whatsapp_templates Meta status (APPROVED only).
 * Frontend/jsonb approvalStatus is never trusted when a company record is supplied.
 */
export function planPurposeTemplate(input: {
  purpose: WhatsAppMessagePurpose;
  params: Record<string, string>;
  bindings?: CompanyWhatsAppTemplateBindings;
  /** Synced company row — Meta status SoT when present. */
  companyTemplate?: CompanyTemplateOutboundRecord | null;
  approvedTemplates?: MetaApprovedTemplateRecord[] | null;
  /** Optional freeform copy for logs / fallbackText field (not sent as text outside window). */
  text?: string;
}): WhatsAppOutboundTemplatePlan {
  const companyTemplate = input.companyTemplate ?? null;
  if (companyTemplate) {
    const metaName = companyTemplate.metaTemplateName.trim();
    const language = normalizeLanguage(companyTemplate.languageCode);
    const status = String(companyTemplate.metaStatus ?? "").toUpperCase();
    assertTemplateAllowed(input.purpose, metaName);

    if (status === "PENDING" || status === "REJECTED" || status === "PAUSED" || status === "DISABLED") {
      throw new WhatsAppTemplateConfigurationError(
        "template_not_approved",
        `Company template "${metaName}" for purpose "${input.purpose}" has Meta status ${status}. Only APPROVED templates may be sent.`,
        { purpose: input.purpose, metaName, language },
      );
    }
    if (status !== "APPROVED") {
      throw new WhatsAppTemplateConfigurationError(
        "template_not_configured",
        `Company template "${metaName}" for purpose "${input.purpose}" is not APPROVED on Meta (status=${status || "UNKNOWN"}). Sync templates after Meta approval.`,
        { purpose: input.purpose, metaName, language },
      );
    }

    assertApprovedAgainstMetaCatalog(metaName, language, input.purpose, input.approvedTemplates);
    const bodyParameters = buildBodyParameters(input.purpose, input.params);
    return {
      mode: "template",
      purpose: input.purpose,
      text: (input.text ?? "").trim(),
      templateKey: input.purpose,
      templateId: metaName,
      languageCode: language,
      bodyParameters,
    };
  }

  const resolved = resolveBinding(input.purpose, input.bindings ?? {});
  assertTemplateAllowed(input.purpose, resolved.metaName);

  // Without a synced company row, refuse — do not trust frontend approval flags.
  throw new WhatsAppTemplateConfigurationError(
    "template_not_configured",
    `No synced APPROVED Meta template for purpose "${input.purpose}". Run WhatsApp template sync after the template is APPROVED on the company WABA.`,
    {
      purpose: input.purpose,
      metaName: resolved.metaName,
      language: resolved.language,
    },
  );
}

/**
 * Customer status: freeform inside 24h window; approved template outside.
 * Worker / connection_test: always template path.
 */
export function planWhatsAppOutbound(input: {
  purpose: WhatsAppMessagePurpose;
  params: Record<string, string>;
  bindings?: CompanyWhatsAppTemplateBindings;
  companyTemplate?: CompanyTemplateOutboundRecord | null;
  approvedTemplates?: MetaApprovedTemplateRecord[] | null;
  sessionWindowOpen: boolean;
  freeformText?: string;
}): WhatsAppOutboundPlan {
  const spec = WHATSAPP_PURPOSE_TEMPLATE_SPECS[input.purpose];

  if (spec.recipient === "customer" && input.sessionWindowOpen && input.freeformText?.trim()) {
    return planSessionFreeformText({
      text: input.freeformText,
      sessionWindowOpen: true,
      languageCode:
        input.companyTemplate?.languageCode ??
        resolveBinding(input.purpose, input.bindings ?? {}).language,
    });
  }

  if (spec.recipient === "customer" && !input.sessionWindowOpen) {
    try {
      return planPurposeTemplate({
        purpose: input.purpose,
        params: input.params,
        bindings: input.bindings,
        companyTemplate: input.companyTemplate,
        approvedTemplates: input.approvedTemplates,
        text: input.freeformText,
      });
    } catch (error) {
      if (error instanceof WhatsAppTemplateConfigurationError) {
        throw new WhatsAppTemplateConfigurationError(
          error.code === "template_not_configured"
            ? "session_window_closed_no_template"
            : error.code,
          `Outside Meta 24h window and ${error.message}`,
          {
            purpose: input.purpose,
            metaName: error.metaName,
            language: error.language,
          },
        );
      }
      throw error;
    }
  }

  // Worker (and connection_test): template required; never rely on customer session window.
  return planPurposeTemplate({
    purpose: input.purpose,
    params: input.params,
    bindings: input.bindings,
    companyTemplate: input.companyTemplate,
    approvedTemplates: input.approvedTemplates,
    text: input.freeformText,
  });
}

/**
 * Queue / legacy registry events must not silently send generic_system / hello_world.
 * Transactional legacy sends require a company-scoped APPROVED template row
 * (same Meta-status gate as purpose-specific sends). connection_test + hello_world only.
 */
export function assertLegacyRegistryTemplateSendable(input: {
  templateId: string;
  event: string;
  languageCode: string;
  /** Company-scoped row from company_whatsapp_templates (Meta status SoT). */
  companyTemplate?: CompanyTemplateOutboundRecord | null;
  /** True when the company catalog lookup threw — fail closed (do not send). */
  companyTemplateLookupError?: boolean;
  approvedTemplates?: MetaApprovedTemplateRecord[] | null;
}): void {
  const metaName = input.templateId.trim();
  if (BLOCKED_TRANSACTIONAL_TEMPLATES.has(metaName.toLowerCase())) {
    throw new WhatsAppTemplateConfigurationError(
      "generic_system_blocked",
      `Refusing to send unapproved/blocked template "${metaName}" for event "${input.event}". Configure a purpose-specific APPROVED Meta template.`,
      { purpose: input.event, metaName, language: input.languageCode },
    );
  }
  if (metaName.toLowerCase() === "hello_world" && input.event !== "connection_test") {
    throw new WhatsAppTemplateConfigurationError(
      "hello_world_not_allowed",
      `hello_world is not allowed for notification event "${input.event}".`,
      { purpose: input.event, metaName },
    );
  }

  // Explicit connection-test exception — never used for transactional notifications.
  if (input.event === "connection_test" && metaName.toLowerCase() === "hello_world") {
    return;
  }

  if (input.companyTemplateLookupError) {
    throw new WhatsAppTemplateConfigurationError(
      "template_not_configured",
      `Unable to verify company WhatsApp template catalog for "${metaName}" (event "${input.event}"). Failing closed.`,
      { purpose: input.event, metaName, language: input.languageCode },
    );
  }

  const companyTemplate = input.companyTemplate ?? null;
  if (!companyTemplate) {
    throw new WhatsAppTemplateConfigurationError(
      "template_not_configured",
      `No company WhatsApp template record for "${metaName}" (event "${input.event}"). Sync an APPROVED Meta template for this company before queue send.`,
      { purpose: input.event, metaName, language: input.languageCode },
    );
  }

  if (companyTemplate.metaTemplateName.trim().toLowerCase() !== metaName.toLowerCase()) {
    throw new WhatsAppTemplateConfigurationError(
      "template_not_allowed",
      `Company template name mismatch for event "${input.event}" (expected "${metaName}").`,
      {
        purpose: input.event,
        metaName,
        language: input.languageCode,
      },
    );
  }

  const status = String(companyTemplate.metaStatus ?? "").toUpperCase();
  const language = normalizeLanguage(companyTemplate.languageCode || input.languageCode);
  if (status === "PENDING" || status === "REJECTED" || status === "PAUSED" || status === "DISABLED") {
    throw new WhatsAppTemplateConfigurationError(
      "template_not_approved",
      `Company template "${metaName}" for event "${input.event}" has Meta status ${status}. Only APPROVED templates may be sent.`,
      { purpose: input.event, metaName, language },
    );
  }
  if (status !== "APPROVED") {
    throw new WhatsAppTemplateConfigurationError(
      "template_not_configured",
      `Company template "${metaName}" for event "${input.event}" is not APPROVED on Meta (status=${status || "UNKNOWN"}). Sync templates after Meta approval.`,
      { purpose: input.event, metaName, language },
    );
  }

  assertApprovedAgainstMetaCatalog(
    metaName,
    language,
    // connection_test is the only purpose that allows hello_world; use as stand-in for catalog check key
    input.event === "connection_test" ? "connection_test" : "delivery_worker_dispatch",
    input.approvedTemplates,
  );
}
