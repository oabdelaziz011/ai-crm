import { memo } from "react";
import { Bell, Link2, Pin, Star, UserPlus, Wifi, WifiOff } from "lucide-react";
import { ChannelBadge } from "@/components/omnichannel/channel-badge";
import { BiDirText } from "@/components/omnichannel/presentation/bidir-text";
import type { ConversationHeader } from "@/lib/conversation-lifecycle/types/lifecycle-types";
import {
  formatPriorityLabel,
  resolveContactDisplayName,
  shouldHideMetaValue,
} from "@/lib/omnichannel/presentation/contact-display";
import { buildContactDisplayInput } from "@/lib/omnichannel/presentation/conversation-contact-identity";
import { resolveUserDisplayName } from "@/lib/omnichannel/presentation/agent-display-name";
import { formatSlaRemainingLabel } from "@/lib/omnichannel/presentation/lifecycle-timeline-presentation";
import { PresenceIndicator, type PresenceState } from "@/components/omnichannel/agent-desk/presence-indicator";
import type { CustomerTone } from "@/lib/omnichannel/types/unified-conversation";
import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";
import type { Profile } from "@/lib/types";

type ConversationHeaderBarProps = {
  header: ConversationHeader;
  conversation?: UnifiedConversation | null;
  conversationId?: string | null;
  languageLabel?: string;
  customerTone?: CustomerTone;
  customerToneLabel?: string;
  presence?: PresenceState;
  presenceLabels?: {
    online: string;
    offline: string;
    away: string;
    busy: string;
    typing: string;
    lastSeen: string;
  };
  channelConnected?: boolean | null;
  channelConnectionLabels?: {
    connected: string;
    error: string;
  };
  channelIssueMessage?: string;
  escalated?: boolean;
  canLinkCustomer?: boolean;
  canCreateCustomer?: boolean;
  visitorLabel: string;
  labels: {
    createCustomer: string;
    linkCustomer: string;
    assignedTo: string;
    assignedAgent: string;
    owner: string;
    aiEmployee: string;
    queue: string;
    priority: string;
    sla: string;
    slaBreached: string;
    noSla: string;
    slaRemainingMinutes: (count: number) => string;
    slaRemainingHours: (count: number) => string;
    status: string;
    language: string;
    escalated: string;
    openProfile: string;
    openCustomer360: string;
  };
  lifecycleLabel: string;
  priorityLabel: (key: string) => string;
  agentsById?: ReadonlyMap<string, { id: string; name: string }>;
  profilesByUserId?: ReadonlyMap<string, Profile>;
  supportAgentFallback?: string;
  onCreateCustomer?: () => void;
  onLinkCustomer?: () => void;
  onAvatarClick?: () => void;
  customer360Label?: string;
  conversationFlags?: {
    pinned?: boolean;
    starred?: boolean;
    following?: boolean;
    markedUnread?: boolean;
  };
  bookmarkLabels?: {
    pin: string;
    star: string;
    markUnread: string;
    follow: string;
  };
  onToggleBookmark?: (flag: "pinned" | "starred" | "following" | "markedUnread") => void;
};

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export const ConversationHeaderBar = memo(function ConversationHeaderBar({
  header,
  conversation,
  conversationId,
  languageLabel,
  customerTone,
  customerToneLabel,
  presence,
  presenceLabels,
  channelConnected,
  channelConnectionLabels,
  channelIssueMessage,
  escalated,
  canLinkCustomer,
  canCreateCustomer,
  visitorLabel,
  labels,
  lifecycleLabel,
  priorityLabel,
  agentsById,
  profilesByUserId,
  supportAgentFallback = "Support Agent",
  onCreateCustomer,
  onLinkCustomer,
  onAvatarClick,
  customer360Label,
  conversationFlags,
  bookmarkLabels,
  onToggleBookmark,
}: ConversationHeaderBarProps) {
  const displayName = resolveContactDisplayName(
    buildContactDisplayInput(conversation ?? null, header.customer, visitorLabel),
  );
  const contactInput = buildContactDisplayInput(conversation ?? null, header.customer, visitorLabel);
  const phoneLine =
    contactInput.phone?.trim()
    || contactInput.metadataPhone?.trim()
    || null;
  const hasCustomer = Boolean(header.customer.id);
  const showPhoneSubline = Boolean(phoneLine) && displayName !== phoneLine;
  const assignedResolved = resolveUserDisplayName(
    header.assignedUser?.id,
    header.assignedUser?.name,
    agentsById ?? new Map(),
    profilesByUserId ?? new Map(),
    supportAgentFallback,
  );
  const assignedName = assignedResolved.display;
  const queueValue = header.queueLabel?.trim() || header.queueId?.trim();
  const priority = formatPriorityLabel(header.priority, priorityLabel);
  const ownerResolved =
    header.owner.kind === "user"
      ? resolveUserDisplayName(
          header.owner.id,
          header.owner.label,
          agentsById ?? new Map(),
          profilesByUserId ?? new Map(),
          supportAgentFallback,
        )
      : { display: header.owner.label?.trim() ?? "", tooltip: undefined };
  const ownerLabel = header.owner.kind !== "unassigned" ? ownerResolved.display : null;
  const ownerTooltip = ownerResolved.tooltip;
  const aiEmployeeName =
    header.aiEmployee?.id && header.aiEmployee.name?.trim() && header.aiEmployee.name !== "AI Employee"
      ? header.aiEmployee.name.trim()
      : header.owner.kind === "ai_employee"
        ? header.owner.label?.trim() ?? null
        : header.aiEmployee?.id
          ? header.aiEmployee.name?.trim() ?? null
          : null;

  const chips: Array<{ key: string; text: string; tone?: "warn" | "danger" | "accent"; tooltip?: string }> = [];

  if (ownerLabel && !shouldHideMetaValue(ownerLabel)) {
    chips.push({ key: "owner", text: `${labels.owner}: ${ownerLabel}`, tooltip: ownerTooltip });
  }
  if (assignedName && !shouldHideMetaValue(assignedName) && assignedName !== ownerLabel) {
    chips.push({
      key: "agent",
      text: `${labels.assignedTo}: ${assignedName}`,
      tooltip: assignedResolved.tooltip,
    });
  }
  if (aiEmployeeName && !shouldHideMetaValue(aiEmployeeName)) {
    chips.push({ key: "ai", text: `${labels.aiEmployee}: ${aiEmployeeName}`, tone: "accent" });
  }
  if (queueValue && !shouldHideMetaValue(queueValue)) {
    chips.push({ key: "queue", text: `${labels.queue}: ${queueValue}` });
  }
  if (priority) {
    chips.push({ key: "priority", text: `${labels.priority}: ${priority}`, tone: "warn" });
  }

  const slaText = formatSlaRemainingLabel(header.sla.dueAt, {
    remainingMinutes: labels.slaRemainingMinutes,
    remainingHours: labels.slaRemainingHours,
    breached: labels.slaBreached,
    notSet: labels.noSla,
  });
  chips.push({
    key: "sla",
    text: `${labels.sla}: ${slaText}`,
    tone: header.sla.breached ? "danger" : undefined,
  });

  chips.push({ key: "status", text: `${labels.status}: ${lifecycleLabel}` });
  if (languageLabel?.trim()) {
    chips.push({ key: "lang", text: `${labels.language}: ${languageLabel}` });
  }

  const toneToneClass =
    customerTone === "happy"
      ? "bg-emerald-500/15 text-emerald-400"
      : customerTone === "angry"
        ? "bg-red-500/15 text-red-400"
        : customerTone === "urgent"
          ? "bg-orange-500/15 text-orange-400"
          : customerTone === "confused"
            ? "bg-sky-500/15 text-sky-400"
            : "bg-[var(--ws-surface-2)] text-[var(--ws-muted)]";

  const presenceLabel =
    presence === "online"
      ? presenceLabels?.online ?? "Online"
      : presence === "away"
        ? presenceLabels?.away ?? "Away"
        : presence === "busy"
          ? presenceLabels?.busy ?? "Busy"
          : presence === "typing"
            ? presenceLabels?.typing ?? "Typing"
            : presenceLabels?.offline ?? "Offline";

  const showPinned = conversation?.isPinned || conversationFlags?.pinned;
  const showStarred = conversationFlags?.starred;
  const showFollowing = conversationFlags?.following;
  const showMarkedUnread = conversationFlags?.markedUnread;

  const avatarTitle = hasCustomer ? labels.openProfile : customer360Label ?? labels.openCustomer360;

  return (
    <div className="shrink-0 border-b border-[var(--ws-border-subtle)] bg-[var(--ws-surface)] px-3 py-2.5">
      <div className="flex items-start gap-3">
        {onAvatarClick ? (
          <button
            type="button"
            className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--ws-surface-2)] text-[12px] font-bold ring-2 ring-[var(--ws-border)] hover:ring-[var(--ws-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ws-accent)]"
            onClick={onAvatarClick}
            aria-label={avatarTitle}
            title={avatarTitle}
          >
            {initials(displayName)}
            {presence && presenceLabels ? (
              <span className="absolute -bottom-0.5 -end-0.5">
                <PresenceIndicator state={presence} label="" compact />
              </span>
            ) : null}
          </button>
        ) : (
          <div className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--ws-surface-2)] text-[12px] font-bold ring-2 ring-[var(--ws-border)]">
            {initials(displayName)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <BiDirText className="truncate text-base font-semibold">{displayName}</BiDirText>
            {presence && presenceLabels ? (
              <PresenceIndicator state={presence} label={presenceLabel} compact />
            ) : null}
            {showPhoneSubline ? (
              <span className="text-xs text-[var(--ws-muted)]" dir="ltr">
                {phoneLine}
              </span>
            ) : null}
            <ChannelBadge channel={header.channel} size="lg" />
            {channelConnected !== null && channelConnectionLabels ? (
              <span
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  channelConnected
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-[var(--ws-danger)]/15 text-[var(--ws-danger)]"
                }`}
                title={channelConnected ? channelConnectionLabels.connected : channelIssueMessage ?? channelConnectionLabels.error}
              >
                {channelConnected ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
                <span dir="auto">{channelConnected ? channelConnectionLabels.connected : channelConnectionLabels.error}</span>
              </span>
            ) : null}
            {escalated ? (
              <span className="rounded bg-[var(--ws-warn)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ws-warn)]" dir="auto">
                {labels.escalated}
              </span>
            ) : null}
            {customerTone && customerToneLabel ? (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${toneToneClass}`} dir="auto">
                {customerToneLabel}
              </span>
            ) : null}
          </div>

          <dl className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {chips.map((chip) => (
              <div key={chip.key} className="text-[10px]">
                <span
                  className={
                    chip.tone === "warn"
                      ? "text-[var(--ws-warn)]"
                      : chip.tone === "danger"
                        ? "text-[var(--ws-danger)]"
                        : chip.tone === "accent"
                          ? "text-[var(--ws-violet)]"
                          : "text-[var(--ws-muted)]"
                  }
                  title={chip.tooltip}
                >
                  <BiDirText forceLtr={chip.key === "sla"}>{chip.text}</BiDirText>
                </span>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {bookmarkLabels && onToggleBookmark ? (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className={`ws-btn ws-btn--ghost p-1.5 ${showPinned ? "text-[var(--ws-accent)]" : ""}`}
                aria-label={bookmarkLabels.pin}
                title={bookmarkLabels.pin}
                aria-pressed={showPinned}
                onClick={() => onToggleBookmark("pinned")}
              >
                <Pin className="size-3.5" />
              </button>
              <button
                type="button"
                className={`ws-btn ws-btn--ghost p-1.5 ${showStarred ? "text-amber-400" : ""}`}
                aria-label={bookmarkLabels.star}
                title={bookmarkLabels.star}
                aria-pressed={showStarred}
                onClick={() => onToggleBookmark("starred")}
              >
                <Star className={`size-3.5 ${showStarred ? "fill-current" : ""}`} />
              </button>
              <button
                type="button"
                className={`ws-btn ws-btn--ghost p-1.5 ${showMarkedUnread ? "text-[var(--ws-accent)]" : ""}`}
                aria-label={bookmarkLabels.markUnread}
                title={bookmarkLabels.markUnread}
                aria-pressed={showMarkedUnread}
                onClick={() => onToggleBookmark("markedUnread")}
              >
                <Bell className="size-3.5" />
              </button>
              <button
                type="button"
                className={`ws-btn ws-btn--ghost p-1.5 ${showFollowing ? "text-sky-300" : ""}`}
                aria-label={bookmarkLabels.follow}
                title={bookmarkLabels.follow}
                aria-pressed={showFollowing}
                onClick={() => onToggleBookmark("following")}
              >
                <span className="text-xs leading-none">●</span>
              </button>
            </div>
          ) : null}
          {!hasCustomer && (canLinkCustomer || canCreateCustomer) ? (
            <div className="flex flex-col gap-1 sm:flex-row">
              {canLinkCustomer ? (
                <button type="button" className="ws-btn ws-btn--ghost text-[10px]" onClick={onLinkCustomer}>
                  <Link2 className="size-3" />
                  {labels.linkCustomer}
                </button>
              ) : null}
              {canCreateCustomer ? (
                <button type="button" className="ws-btn ws-btn--primary text-[10px]" onClick={onCreateCustomer}>
                  <UserPlus className="size-3" />
                  {labels.createCustomer}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});
