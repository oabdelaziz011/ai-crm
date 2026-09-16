import type { EmailTemplateCategoryId } from "./email-template-categories";
import type { EmailTemplateInput } from "./types";

/**
 * Recommended starting points only — never persisted until the user saves
 * through the existing company-scoped template repository.
 */
export type RecommendedEmailTemplate = EmailTemplateInput & {
  categoryId: Exclude<EmailTemplateCategoryId, "other">;
};

export const RECOMMENDED_EMAIL_TEMPLATES: readonly RecommendedEmailTemplate[] = [
  {
    categoryId: "customer_service",
    name: "Welcome Customer",
    code: "welcome_customer",
    subject: "Welcome to {{company.name}}",
    body: "Dear {{customer.name}},\n\nWelcome to {{company.name}}. We are glad to assist you.\n\nBest regards,\n{{company.name}}",
    enabled: true,
  },
  {
    categoryId: "customer_service",
    name: "Thank You",
    code: "thank_you",
    subject: "Thank you, {{customer.name}}",
    body: "Dear {{customer.name}},\n\nThank you for contacting {{company.name}}. We appreciate your message.\n\nBest regards,\n{{company.name}}",
    enabled: true,
  },
  {
    categoryId: "customer_service",
    name: "Request More Information",
    code: "request_more_info",
    subject: "Additional information needed",
    body: "Dear {{customer.name}},\n\nCould you please share more details so we can continue helping you?\n\nBest regards,\n{{company.name}}",
    enabled: true,
  },
  {
    categoryId: "follow_up",
    name: "Follow Up",
    code: "follow_up",
    subject: "Following up on your request",
    body: "Dear {{customer.name}},\n\nWe are following up on your request. Please let us know if you need anything further.\n\nBest regards,\n{{company.name}}",
    enabled: true,
  },
  {
    categoryId: "complaints",
    name: "Apology",
    code: "apology",
    subject: "Our apology regarding your request",
    body: "Dear {{customer.name}},\n\nWe apologize for the inconvenience. Your request {{ticket.number}} is receiving our attention.\n\nBest regards,\n{{company.name}}",
    enabled: true,
  },
  {
    categoryId: "tickets",
    name: "Ticket Created",
    code: "ticket_created",
    subject: "Ticket {{ticket.number}} created",
    body: "Dear {{customer.name}},\n\nWe created ticket {{ticket.number}} ({{ticket.subject}}). Current status: {{ticket.status}}.\n\nBest regards,\n{{company.name}}",
    enabled: true,
  },
  {
    categoryId: "tickets",
    name: "Ticket Status Update",
    code: "ticket_status_update",
    subject: "Update on {{ticket.number}}",
    body: "Dear {{customer.name}},\n\nTicket {{ticket.number}} is currently {{ticket.status}} with priority {{ticket.priority}}.\n\nBest regards,\n{{company.name}}",
    enabled: true,
  },
  {
    categoryId: "tickets",
    name: "Ticket Resolved",
    code: "ticket_resolved",
    subject: "Ticket {{ticket.number}} resolved",
    body: "Dear {{customer.name}},\n\nTicket {{ticket.number}} has been marked resolved. Please reply if you need further help.\n\nBest regards,\n{{company.name}}",
    enabled: true,
  },
  {
    categoryId: "tickets",
    name: "Ticket Closed",
    code: "ticket_closed",
    subject: "Ticket {{ticket.number}} closed",
    body: "Dear {{customer.name}},\n\nTicket {{ticket.number}} is now closed.\n\nBest regards,\n{{company.name}}",
    enabled: true,
  },
  {
    categoryId: "complaints",
    name: "Escalation",
    code: "escalation",
    subject: "Escalation for {{ticket.number}}",
    body: "Dear {{customer.name}},\n\nWe have escalated ticket {{ticket.number}} ({{ticket.priority}}).\n\nBest regards,\n{{company.name}}",
    enabled: true,
  },
  {
    categoryId: "tickets",
    name: "SLA Delay",
    code: "sla_delay",
    subject: "Update on {{ticket.number}}",
    body: "Dear {{customer.name}},\n\nWe are still working on {{ticket.number}} and will update you as soon as possible.\n\nBest regards,\n{{company.name}}",
    enabled: true,
  },
  {
    categoryId: "sales",
    name: "Introduction",
    code: "sales_introduction",
    subject: "Introduction from {{company.name}}",
    body: "Dear {{customer.name}},\n\nThank you for your interest in {{company.name}}.\n\nBest regards,\n{{company.name}}",
    enabled: true,
  },
  {
    categoryId: "sales",
    name: "Product Inquiry",
    code: "product_inquiry",
    subject: "Regarding your product inquiry",
    body: "Dear {{customer.name}},\n\nThank you for your product inquiry. We will share the details you need.\n\nBest regards,\n{{company.name}}",
    enabled: true,
  },
  {
    categoryId: "sales",
    name: "Sales Quotation",
    code: "sales_quotation",
    subject: "Following up on your quotation",
    body: "Dear {{customer.name}},\n\nWe wanted to follow up on the quotation we shared.\n\nBest regards,\n{{company.name}}",
    enabled: true,
  },
  {
    categoryId: "sales",
    name: "Sales Proposal",
    code: "sales_proposal",
    subject: "Following up on our proposal",
    body: "Dear {{customer.name}},\n\nWe are following up on the proposal from {{company.name}}.\n\nBest regards,\n{{company.name}}",
    enabled: true,
  },
  {
    categoryId: "sales",
    name: "Meeting Confirmation",
    code: "meeting_confirmation",
    subject: "Meeting confirmation",
    body: "Dear {{customer.name}},\n\nThis confirms your meeting with {{company.name}}.\n\nBest regards,\n{{company.name}}",
    enabled: true,
  },
  {
    categoryId: "operations",
    name: "Booking Confirmation",
    code: "booking_confirmation",
    subject: "Booking {{booking.reference}} confirmed",
    body: "Dear {{customer.name}},\n\nYour booking {{booking.reference}} is confirmed.\n\nBest regards,\n{{company.name}}",
    enabled: true,
  },
  {
    categoryId: "operations",
    name: "Booking Reminder",
    code: "booking_reminder",
    subject: "Reminder: booking {{booking.reference}}",
    body: "Dear {{customer.name}},\n\nThis is a reminder for booking {{booking.reference}}.\n\nBest regards,\n{{company.name}}",
    enabled: true,
  },
  {
    categoryId: "operations",
    name: "Booking Rescheduled",
    code: "booking_rescheduled",
    subject: "Booking {{booking.reference}} rescheduled",
    body: "Dear {{customer.name}},\n\nBooking {{booking.reference}} has been rescheduled.\n\nBest regards,\n{{company.name}}",
    enabled: true,
  },
  {
    categoryId: "operations",
    name: "Booking Cancelled",
    code: "booking_cancelled",
    subject: "Booking {{booking.reference}} cancelled",
    body: "Dear {{customer.name}},\n\nBooking {{booking.reference}} has been cancelled.\n\nBest regards,\n{{company.name}}",
    enabled: true,
  },
] as const;

export function recommendedTemplatesForCategory(
  categoryId: Exclude<EmailTemplateCategoryId, "other">,
): RecommendedEmailTemplate[] {
  return RECOMMENDED_EMAIL_TEMPLATES.filter((row) => row.categoryId === categoryId);
}
