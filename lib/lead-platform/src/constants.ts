export const LEAD_PERMISSIONS = {
  view: "leads.view",
  create: "leads.create",
  edit: "leads.edit",
  assign: "leads.assign",
  qualify: "leads.qualify",
  convert: "leads.convert",
  merge: "leads.merge",
  archive: "leads.archive",
  manage: "leads.manage",
} as const;

export const LEAD_LIFECYCLE_STATUSES = [
  "new",
  "qualified",
  "contacted",
  "demo_scheduled",
  "proposal_sent",
  "negotiation",
  "won",
  "lost",
  "converted",
  "archived",
] as const;

export const LEAD_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export const ASSIGNMENT_METHODS = [
  "manual",
  "round_robin",
  "least_busy",
  "territory",
  "department",
  "language",
  "vip",
] as const;

export const LEAD_DOMAIN_EVENTS = [
  "lead_created",
  "lead_updated",
  "lead_deleted",
  "lead_assigned",
  "lead_reassigned",
  "lead_qualified",
  "lead_disqualified",
  "lead_converted",
  "lead_archived",
  "lead_restored",
  "lead_stage_changed",
  "lead_pipeline_changed",
] as const;

export const LEAD_WORKFLOW_EVENTS: Record<(typeof LEAD_DOMAIN_EVENTS)[number], string> = {
  lead_created: "lead.created",
  lead_updated: "lead.updated",
  lead_deleted: "lead.deleted",
  lead_assigned: "lead.assigned",
  lead_reassigned: "lead.reassigned",
  lead_qualified: "lead.qualified",
  lead_disqualified: "lead.disqualified",
  lead_converted: "lead.converted",
  lead_archived: "lead.archived",
  lead_restored: "lead.restored",
  lead_stage_changed: "lead.stage_changed",
  lead_pipeline_changed: "lead.pipeline_changed",
};

export const TERMINAL_LEAD_STATUSES = ["won", "lost", "converted", "archived"] as const;

export const LEAD_QUERY_CACHE_TTL = {
  metrics: 5 * 60 * 1000,
  pipeline: 60 * 1000,
  lead: 30 * 1000,
  search: 30 * 1000,
} as const;

export const DEFAULT_STAGE_TRANSITIONS: Record<string, string[]> = {
  new: ["qualified", "contacted", "lost", "archived"],
  qualified: ["contacted", "demo_scheduled", "lost", "archived"],
  contacted: ["demo_scheduled", "proposal_sent", "lost", "archived"],
  demo_scheduled: ["proposal_sent", "negotiation", "lost", "archived"],
  proposal_sent: ["negotiation", "won", "lost", "archived"],
  negotiation: ["won", "lost", "archived"],
  won: ["converted", "archived"],
  lost: ["new", "archived"],
  converted: ["archived"],
  archived: ["new"],
};
