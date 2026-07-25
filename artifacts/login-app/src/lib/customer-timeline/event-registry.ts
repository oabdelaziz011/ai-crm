import {
  Bot,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CircleDollarSign,
  FileText,
  Mail,
  MessageCircle,
  MessageSquare,
  MousePointerClick,
  PhoneCall,
  Sparkles,
  StickyNote,
  UserPen,
  UserPlus,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type {
  TimelineEvent,
  TimelineEventCategory,
  TimelineEventType,
  TimelineRenderContext,
} from "./types";

export type TimelineEventDescriptor = {
  type: TimelineEventType;
  category: TimelineEventCategory;
  icon: LucideIcon;
  accentClass: string;
  resolveTitle: (event: TimelineEvent, ctx: TimelineRenderContext) => string;
  resolveDescription?: (event: TimelineEvent, ctx: TimelineRenderContext) => string | null;
};

const descriptors = new Map<TimelineEventType, TimelineEventDescriptor>();

function defineDescriptor(descriptor: TimelineEventDescriptor) {
  descriptors.set(descriptor.type, descriptor);
}

export function registerTimelineEventDescriptor(descriptor: TimelineEventDescriptor): void {
  descriptors.set(descriptor.type, descriptor);
}

export function getTimelineEventDescriptor(
  type: TimelineEventType,
): TimelineEventDescriptor | undefined {
  return descriptors.get(type);
}

function t(ctx: TimelineRenderContext, key: string, options?: Record<string, unknown>): string {
  return ctx.translate(`dashboard.customerProfile.timeline.events.${key}`, options);
}

function payloadString(event: TimelineEvent, key: string): string | null {
  const value = event.payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

defineDescriptor({
  type: "customer_created",
  category: "lifecycle",
  icon: UserPlus,
  accentClass: "text-sky-400 bg-sky-500/15 border-sky-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "customer_created.title"),
  resolveDescription: (_event, ctx) => t(ctx, "customer_created.description"),
});

defineDescriptor({
  type: "whatsapp_message_received",
  category: "communication",
  icon: MessageCircle,
  accentClass: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "whatsapp_message_received.title"),
  resolveDescription: (event) => event.metadata?.detail ?? null,
});

defineDescriptor({
  type: "whatsapp_message_sent",
  category: "communication",
  icon: MessageSquare,
  accentClass: "text-emerald-300 bg-emerald-500/10 border-emerald-500/25",
  resolveTitle: (_event, ctx) => t(ctx, "whatsapp_message_sent.title"),
  resolveDescription: (event) => event.metadata?.detail ?? null,
});

defineDescriptor({
  type: "template_sent",
  category: "communication",
  icon: MessageSquare,
  accentClass: "text-teal-400 bg-teal-500/15 border-teal-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "template_sent.title"),
  resolveDescription: (event) => event.metadata?.detail ?? null,
});

defineDescriptor({
  type: "interactive_reply",
  category: "communication",
  icon: MousePointerClick,
  accentClass: "text-lime-400 bg-lime-500/15 border-lime-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "interactive_reply.title"),
  resolveDescription: (event) => event.metadata?.detail ?? null,
});

defineDescriptor({
  type: "facebook_message",
  category: "communication",
  icon: MessageCircle,
  accentClass: "text-blue-400 bg-blue-500/15 border-blue-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "facebook_message.title"),
});

defineDescriptor({
  type: "instagram_message",
  category: "communication",
  icon: MessageCircle,
  accentClass: "text-pink-400 bg-pink-500/15 border-pink-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "instagram_message.title"),
});

defineDescriptor({
  type: "booking_created",
  category: "booking",
  icon: CalendarCheck,
  accentClass: "text-violet-400 bg-violet-500/15 border-violet-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "booking_created.title"),
  resolveDescription: (event) => event.metadata?.detail ?? payloadString(event, "service"),
});

defineDescriptor({
  type: "booking_confirmed",
  category: "booking",
  icon: CalendarCheck,
  accentClass: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "booking_confirmed.title"),
  resolveDescription: (event) => event.metadata?.detail ?? null,
});

defineDescriptor({
  type: "booking_rescheduled",
  category: "booking",
  icon: CalendarClock,
  accentClass: "text-amber-400 bg-amber-500/15 border-amber-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "booking_rescheduled.title"),
  resolveDescription: (event) => event.metadata?.detail ?? null,
});

defineDescriptor({
  type: "booking_completed",
  category: "booking",
  icon: CalendarCheck,
  accentClass: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "booking_completed.title"),
  resolveDescription: (event) => event.metadata?.detail ?? null,
});

defineDescriptor({
  type: "booking_cancelled",
  category: "booking",
  icon: CalendarX,
  accentClass: "text-rose-400 bg-rose-500/15 border-rose-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "booking_cancelled.title"),
  resolveDescription: (event) => event.metadata?.detail ?? null,
});

defineDescriptor({
  type: "invoice_created",
  category: "billing",
  icon: FileText,
  accentClass: "text-amber-400 bg-amber-500/15 border-amber-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "invoice_created.title"),
  resolveDescription: (event) => event.metadata?.detail ?? null,
});

defineDescriptor({
  type: "invoice_paid",
  category: "billing",
  icon: CircleDollarSign,
  accentClass: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "invoice_paid.title"),
  resolveDescription: (event) => event.metadata?.detail ?? null,
});

defineDescriptor({
  type: "invoice_overdue",
  category: "billing",
  icon: CircleDollarSign,
  accentClass: "text-rose-400 bg-rose-500/15 border-rose-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "invoice_overdue.title"),
  resolveDescription: (event) => event.metadata?.detail ?? null,
});

defineDescriptor({
  type: "payment_received",
  category: "billing",
  icon: CircleDollarSign,
  accentClass: "text-green-400 bg-green-500/15 border-green-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "payment_received.title"),
  resolveDescription: (event) => event.metadata?.detail ?? null,
});

defineDescriptor({
  type: "note_added",
  category: "note",
  icon: StickyNote,
  accentClass: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "note_added.title"),
  resolveDescription: (event) => event.metadata?.detail ?? null,
});

defineDescriptor({
  type: "customer_updated",
  category: "agent",
  icon: UserPen,
  accentClass: "text-indigo-400 bg-indigo-500/15 border-indigo-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "customer_updated.title"),
  resolveDescription: (event) => event.metadata?.detail ?? null,
});

defineDescriptor({
  type: "conversation_closed",
  category: "agent",
  icon: MessageCircle,
  accentClass: "text-slate-400 bg-slate-500/15 border-slate-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "conversation_closed.title"),
  resolveDescription: (event) => event.metadata?.detail ?? null,
});

defineDescriptor({
  type: "conversation_reopened",
  category: "agent",
  icon: MessageCircle,
  accentClass: "text-cyan-400 bg-cyan-500/15 border-cyan-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "conversation_reopened.title"),
  resolveDescription: (event) => event.metadata?.detail ?? null,
});

defineDescriptor({
  type: "call_started",
  category: "call",
  icon: PhoneCall,
  accentClass: "text-cyan-400 bg-cyan-500/15 border-cyan-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "call_started.title"),
});

defineDescriptor({
  type: "call_finished",
  category: "call",
  icon: PhoneCall,
  accentClass: "text-cyan-400 bg-cyan-500/15 border-cyan-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "call_finished.title"),
});

defineDescriptor({
  type: "email_received",
  category: "email",
  icon: Mail,
  accentClass: "text-indigo-400 bg-indigo-500/15 border-indigo-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "email_received.title"),
});

defineDescriptor({
  type: "email_sent",
  category: "email",
  icon: Mail,
  accentClass: "text-indigo-400 bg-indigo-500/15 border-indigo-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "email_sent.title"),
  resolveDescription: (event) => event.metadata?.detail ?? null,
});

defineDescriptor({
  type: "notification_delivered",
  category: "notification",
  icon: MessageSquare,
  accentClass: "text-blue-400 bg-blue-500/15 border-blue-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "notification_delivered.title"),
  resolveDescription: (event) => event.metadata?.detail ?? null,
});

defineDescriptor({
  type: "calendar_event",
  category: "booking",
  icon: CalendarCheck,
  accentClass: "text-violet-400 bg-violet-500/15 border-violet-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "calendar_event.title"),
});

defineDescriptor({
  type: "manual_activity",
  category: "manual",
  icon: StickyNote,
  accentClass: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "manual_activity.title"),
});

defineDescriptor({
  type: "automation_started",
  category: "automation",
  icon: Workflow,
  accentClass: "text-orange-400 bg-orange-500/15 border-orange-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "automation_started.title"),
});

defineDescriptor({
  type: "automation_finished",
  category: "automation",
  icon: Workflow,
  accentClass: "text-orange-400 bg-orange-500/15 border-orange-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "automation_finished.title"),
});

defineDescriptor({
  type: "ai_summary_updated",
  category: "ai",
  icon: Sparkles,
  accentClass: "text-fuchsia-400 bg-fuchsia-500/15 border-fuchsia-500/30",
  resolveTitle: (_event, ctx) => t(ctx, "ai_summary_updated.title"),
});

const FALLBACK_DESCRIPTOR: TimelineEventDescriptor = {
  type: "customer_created",
  category: "system",
  icon: Bot,
  accentClass: "text-muted-foreground bg-white/5 border-white/10",
  resolveTitle: (event, ctx) =>
    ctx.translate("dashboard.customerProfile.timeline.fallbackTitle", { type: event.type }),
};

export function resolveTimelineEventDescriptor(event: TimelineEvent): TimelineEventDescriptor {
  return getTimelineEventDescriptor(event.type) ?? FALLBACK_DESCRIPTOR;
}
