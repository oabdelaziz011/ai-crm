export const QUOTE_PERMISSIONS = {
  view: "quotes.view",
  create: "quotes.create",
  edit: "quotes.edit",
  delete: "quotes.delete",
  send: "quotes.send",
  approve: "quotes.approve",
} as const;

export const QUOTE_STATUSES = [
  "draft",
  "internal_review",
  "sent",
  "viewed",
  "accepted",
  "rejected",
  "expired",
  "converted",
] as const;

export const QUOTE_LINE_KINDS = [
  "product",
  "service",
  "bundle",
  "addon",
  "manual",
  "optional",
  "section",
  "note",
] as const;

export const QUOTE_APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;

export const QUOTE_HISTORY_EVENTS = [
  "quote_created",
  "quote_updated",
  "quote_sent",
  "quote_viewed",
  "quote_accepted",
  "quote_rejected",
  "quote_expired",
  "quote_version_created",
  "approval_requested",
  "approval_decided",
] as const;
