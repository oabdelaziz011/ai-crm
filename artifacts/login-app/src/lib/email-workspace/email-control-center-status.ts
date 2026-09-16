/**
 * Maps existing Email settings / entitlements / routing / templates into
 * Control Center cards. Never invents health when the backend did not report it.
 */

export type EmailControlCenterCardId =
  | "inbound"
  | "outbound"
  | "routing"
  | "tickets"
  | "templates";

export type EmailControlCenterHealth = "healthy" | "needs_attention" | null;

export type EmailControlCenterAction = "configure" | "view" | "fix" | "upgrade";

export type EmailControlCenterCard = {
  id: EmailControlCenterCardId;
  configured: boolean;
  enabled: boolean | null;
  health: EmailControlCenterHealth;
  action: EmailControlCenterAction;
  href: string;
};

export type EmailControlCenterSnapshot = {
  settingsLoaded: boolean;
  emailConfigured: boolean;
  cards: EmailControlCenterCard[];
};

export type EmailAiCapabilityId = "routing" | "composer" | "suggested_replies" | "summary";

export type EmailAiCapability = {
  id: EmailAiCapabilityId;
  entitled: boolean | undefined;
};

export type EmailRoutingTicketPresentation = "create_or_reuse" | "manual_review";

export function mapEmailRoutingTicketPresentation(input: {
  enabled: boolean;
  targetId: string | null;
}): EmailRoutingTicketPresentation {
  return input.enabled && Boolean(input.targetId) ? "create_or_reuse" : "manual_review";
}

export function mapEmailAiCapabilities(input: {
  routingEntitled: boolean | undefined;
  assistantEntitled: boolean | undefined;
  suggestedRepliesEntitled: boolean | undefined;
}): EmailAiCapability[] {
  return [
    { id: "routing", entitled: input.routingEntitled },
    { id: "composer", entitled: input.assistantEntitled },
    { id: "suggested_replies", entitled: input.suggestedRepliesEntitled },
    { id: "summary", entitled: input.assistantEntitled },
  ];
}

function pickAction(configured: boolean, health: EmailControlCenterHealth): EmailControlCenterAction {
  if (!configured) return "configure";
  if (health === "needs_attention") return "fix";
  return "view";
}

export function mapEmailControlCenterStatus(input: {
  settingsLoaded: boolean;
  settings?: {
    enabled: boolean;
    conversationEnabled: boolean;
    smtpHost?: string | null;
    fromEmail?: string | null;
    imapHost?: string | null;
    inboundProvider?: string | null;
  } | null;
  routingEntitled: boolean | undefined;
  routingHasEnabledTarget: boolean;
  ticketingEntitled: boolean | undefined;
  templateCount: number | null;
  outboundHealthOk?: boolean | null;
  inboundHealthOk?: boolean | null;
}): EmailControlCenterSnapshot {
  const settings = input.settings;
  const inboundConfigured = Boolean(
    settings &&
      (settings.conversationEnabled ||
        (settings.imapHost && String(settings.imapHost).trim()) ||
        settings.inboundProvider === "webhook"),
  );
  const inboundEnabled = settings ? Boolean(settings.enabled && settings.conversationEnabled) : false;
  const outboundConfigured = Boolean(
    settings && String(settings.smtpHost ?? "").trim() && String(settings.fromEmail ?? "").trim(),
  );
  const outboundEnabled = settings ? Boolean(settings.enabled && outboundConfigured) : false;

  const inboundHealth: EmailControlCenterHealth =
    input.inboundHealthOk == null ? null : input.inboundHealthOk ? "healthy" : "needs_attention";
  const outboundHealth: EmailControlCenterHealth =
    input.outboundHealthOk == null ? null : input.outboundHealthOk ? "healthy" : "needs_attention";

  const routingConfigured = input.routingEntitled === true && input.routingHasEnabledTarget;
  const routingEnabled = routingConfigured;
  const ticketsConfigured = input.ticketingEntitled === true;
  const templatesConfigured = input.templateCount != null && input.templateCount > 0;

  const inbound: EmailControlCenterCard = {
    id: "inbound",
    configured: inboundConfigured,
    enabled: inboundEnabled,
    health: inboundHealth,
    action: pickAction(inboundConfigured && inboundEnabled, inboundHealth),
    href: "~/dashboard/settings/email#email-connection",
  };
  const outbound: EmailControlCenterCard = {
    id: "outbound",
    configured: outboundConfigured,
    enabled: outboundEnabled,
    health: outboundHealth,
    action: pickAction(outboundConfigured && outboundEnabled, outboundHealth),
    href: "~/dashboard/settings/email#email-sending",
  };
  const routing: EmailControlCenterCard = {
    id: "routing",
    configured: routingConfigured,
    enabled: input.routingEntitled === true ? routingEnabled : false,
    health: null,
    action:
      input.routingEntitled === false
        ? "upgrade"
        : pickAction(routingConfigured, null),
    href: "~/dashboard/email/ai-routing",
  };
  const tickets: EmailControlCenterCard = {
    id: "tickets",
    configured: ticketsConfigured,
    enabled: ticketsConfigured,
    health: null,
    action: ticketsConfigured ? "view" : "upgrade",
    href: "~/dashboard/email/ai-routing#email-ticket-automation",
  };
  const templates: EmailControlCenterCard = {
    id: "templates",
    configured: templatesConfigured,
    enabled: templatesConfigured,
    health: null,
    action: templatesConfigured ? "view" : "configure",
    href: "~/dashboard/email/templates",
  };

  const emailConfigured = inboundEnabled && outboundEnabled;

  return {
    settingsLoaded: input.settingsLoaded,
    emailConfigured,
    cards: [inbound, outbound, routing, tickets, templates],
  };
}
