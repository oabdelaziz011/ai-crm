import {
  AlertTriangle,
  Bot,
  Check,
  CornerDownLeft,
  Link2,
  Lock,
  LockOpen,
  MessageSquare,
  StickyNote,
  Ticket,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import type {
  ConversationHistoryEvent,
  ConversationHistoryEventKind,
} from "@/lib/omnichannel/presentation/conversation-intelligence-types";

export function iconForEventKind(kind: ConversationHistoryEventKind) {
  switch (kind) {
    case "customer_message":
    case "customer_first_message":
    case "agent_message":
      return MessageSquare;
    case "ai_message":
    case "ai_summary":
      return Bot;
    case "internal_note":
      return StickyNote;
    case "assignment":
    case "queue_change":
    case "transfer":
      return Users;
    case "human_takeover":
    case "agent_joined":
      return Users;
    case "escalation":
    case "return_escalation":
      return AlertTriangle;
    case "conversation_resolved":
      return Check;
    case "conversation_closed":
      return Lock;
    case "conversation_reopened":
      return LockOpen;
    case "ticket_created":
    case "ticket_resolved":
      return Ticket;
    case "customer_linked":
    case "customer_created":
    case "ownership_change":
      return Link2;
    case "ai_takeover":
      return CornerDownLeft;
    case "workflow_action":
      return Workflow;
    case "automation_action":
      return Zap;
    default:
      return MessageSquare;
  }
}

export function historyBadgeClass(tone: ConversationHistoryEvent["badgeTone"]): string {
  switch (tone) {
    case "accent":
      return "bg-[var(--ws-accent-dim)] text-[var(--ws-accent)]";
    case "warn":
      return "bg-[var(--ws-warn)]/15 text-[var(--ws-warn)]";
    case "danger":
      return "bg-[var(--ws-danger)]/15 text-[var(--ws-danger)]";
    case "violet":
      return "bg-violet-500/15 text-[var(--ws-violet)]";
    case "success":
      return "bg-emerald-500/15 text-emerald-400";
    default:
      return "bg-[var(--ws-surface)] text-[var(--ws-muted)]";
  }
}

export function healthStatusClass(status: "healthy" | "warning" | "critical"): string {
  if (status === "healthy") return "text-emerald-400";
  if (status === "warning") return "text-[var(--ws-warn)]";
  return "text-[var(--ws-danger)]";
}

export function avatarToneClass(actorType: ConversationHistoryEvent["actorType"]): string {
  switch (actorType) {
    case "customer":
      return "bg-sky-500/15 text-sky-300";
    case "ai":
      return "bg-violet-500/15 text-violet-200";
    case "agent":
      return "bg-[var(--ws-accent-dim)] text-[var(--ws-accent)]";
    default:
      return "bg-[var(--ws-surface)] text-[var(--ws-muted)]";
  }
}
