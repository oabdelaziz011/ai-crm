import { memo } from "react";
import { Bell, BellOff, Link2, Maximize2, Minimize2, Pin, Star, UserPlus, Wifi, WifiOff } from "lucide-react";
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
import { PresenceIndicator, type PresenceState } from "@/components/omnichannel/agent-desk/presence-indicator";
import type { CustomerTone } from "@/lib/omnichannel/types/unified-conversation";
import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";
import type { Profile } from "@/lib/types";
import { ConversationIdentityAvatar } from "@/components/omnichannel/workspace-v2/conversation-identity-avatar";
import { SlaBadge } from "@/components/omnichannel/workspace-v2/sla-badge";
import { resolveConversationSlaPresentation } from "@/lib/omnichannel/presentation/conversation-sla-presentation";
import { resolveConversationIdentityAvatar } from "@/lib/omnichannel/presentation/conversation-identity-avatar";
import { useSlaNow } from "@/hooks/omnichannel/use-sla-now";

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
    slaAtRisk?: string;
    slaCompleted?: string;
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
  deskChrome?: {
    soundEnabled: boolean;
    soundOnLabel: string;
    soundOffLabel: string;
    onToggleSound: () => void;
    conversationExpanded: boolean;
    expandLabel: string;
    collapseLabel: string;
    onToggleExpand: () => void;
  };
};

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
  deskChrome,
}: ConversationHeaderBarProps) {
  const slaNow = useSlaNow();
  const displayName = resolveContactDisplayName(
    buildContactDisplayInput(conversation ?? null, header.customer, visitorLabel),
  );
  const identity = resolveConversationIdentityAvatar({
    conversation: conversation ?? null,
    customer: conversation?.customer ?? (header.customer.id
      ? {
          id: header.customer.id,
          name: header.customer.name,
          phone: header.customer.phone,
          email: header.customer.email,
        }
      : null),
    visitorLabel,
    expectedCompanyId: conversation?.companyId ?? null,
  });
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

  // Ticket-centric: SLA only when conversation has an active linked support ticket.
  const activeTicket = conversation?.ticketContext?.isActive ? conversation.ticketContext : null;
  const slaPresentation = resolveConversationSlaPresentation({
    dueAt: activeTicket?.slaDueAt ?? null,
    lifecycleState: header.lifecycleState,
    now: slaNow,
    labels: {
      prefix: labels.sla,
      remainingMinutes: labels.slaRemainingMinutes,
      remainingHours: labels.slaRemainingHours,
      breached: labels.slaBreached,
      atRisk: labels.slaAtRisk ?? "At risk",
      notSet: labels.noSla,
      completed: labels.slaCompleted ?? "Completed",
    },
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

  const avatarTitle = hasCustomer ? labels.openProfile : customer360Label ?? labels.openCustomer360;

  const hasMetaRow =
    chips.length > 0
    || (channelConnected !== null && Boolean(channelConnectionLabels))
    || Boolean(escalated)
    || Boolean(customerTone && customerToneLabel);

  return (
    <div className="ws-conversation-header shrink-0 border-b border-[var(--ws-border-subtle)] bg-[var(--ws-surface)] px-2 py-0.5">
      {/* Primary row: identity + channel + ticket/SLA cluster + actions */}
      <div className="flex items-center gap-1.5">
        <div className="relative shrink-0">
          <ConversationIdentityAvatar
            identity={identity}
            size="sm"
            onClick={onAvatarClick}
            ariaLabel={avatarTitle}
            title={avatarTitle}
          />
          {presence && presenceLabels ? (
            <span className="absolute -bottom-0.5 -start-0.5">
              <PresenceIndicator state={presence} label="" compact />
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          <BiDirText className="min-w-0 truncate text-sm font-semibold leading-tight">{displayName}</BiDirText>
          {presence && presenceLabels ? (
            <PresenceIndicator state={presence} label={presenceLabel} compact />
          ) : null}
          {showPhoneSubline ? (
            <span className="max-w-[7.5rem] shrink truncate text-[11px] leading-tight text-[var(--ws-muted)]" dir="ltr" title={phoneLine ?? undefined}>
              {phoneLine}
            </span>
          ) : null}
          <ChannelBadge channel={header.channel} size="sm" className="shrink-0" />
        </div>

        <div className="ws-header-ticket-sla" data-testid="conversation-header-ticket-sla">
          {activeTicket ? (
            <span
              className="inline-flex max-w-[11rem] shrink-0 items-center gap-1 truncate rounded-md border border-[var(--ws-border)] bg-[var(--ws-surface-2)] px-1.5 py-px text-[10px] font-semibold leading-tight text-[var(--ws-text)]"
              title={activeTicket.subject || activeTicket.ticketNumber}
              data-ticket-context={activeTicket.ticketId}
            >
              <span className="truncate" dir="ltr">
                {activeTicket.ticketNumber} · {activeTicket.status.replace(/_/g, " ")}
              </span>
            </span>
          ) : null}
          <SlaBadge
            presentation={slaPresentation}
            size="sm"
            hideWhenUnavailable
            className="!w-auto max-w-[10rem] shrink-0"
          />
        </div>

        <div className="flex shrink-0 items-center gap-0.5 self-start" dir="ltr">
          {(bookmarkLabels && onToggleBookmark) || deskChrome ? (
            <div className="flex items-center gap-0">
              {bookmarkLabels && onToggleBookmark ? (
                <>
                  <button
                    type="button"
                    className={`ws-btn ws-btn--ghost p-1 ${showPinned ? "text-[var(--ws-accent)]" : ""}`}
                    aria-label={bookmarkLabels.pin}
                    title={bookmarkLabels.pin}
                    aria-pressed={showPinned}
                    onClick={() => onToggleBookmark("pinned")}
                  >
                    <Pin className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className={`ws-btn ws-btn--ghost p-1 ${showStarred ? "text-amber-400" : ""}`}
                    aria-label={bookmarkLabels.star}
                    title={bookmarkLabels.star}
                    aria-pressed={showStarred}
                    onClick={() => onToggleBookmark("starred")}
                  >
                    <Star className={`size-3.5 ${showStarred ? "fill-current" : ""}`} />
                  </button>
                </>
              ) : null}
              {deskChrome ? (
                <>
                  <button
                    type="button"
                    className={`ws-btn ws-btn--ghost p-1 ${deskChrome.soundEnabled ? "text-[var(--ws-accent)]" : "text-[var(--ws-muted)] opacity-70"}`}
                    aria-label={deskChrome.soundEnabled ? deskChrome.soundOnLabel : deskChrome.soundOffLabel}
                    title={deskChrome.soundEnabled ? deskChrome.soundOnLabel : deskChrome.soundOffLabel}
                    aria-pressed={deskChrome.soundEnabled}
                    onClick={deskChrome.onToggleSound}
                  >
                    {deskChrome.soundEnabled ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    className={`ws-btn ws-btn--ghost p-1 ${deskChrome.conversationExpanded ? "text-[var(--ws-accent)]" : ""}`}
                    aria-label={
                      deskChrome.conversationExpanded ? deskChrome.collapseLabel : deskChrome.expandLabel
                    }
                    title={
                      deskChrome.conversationExpanded ? deskChrome.collapseLabel : deskChrome.expandLabel
                    }
                    aria-pressed={deskChrome.conversationExpanded}
                    onClick={deskChrome.onToggleExpand}
                  >
                    {deskChrome.conversationExpanded ? (
                      <Minimize2 className="size-3.5" aria-hidden />
                    ) : (
                      <Maximize2 className="size-3.5" aria-hidden />
                    )}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
          {!hasCustomer && (canLinkCustomer || canCreateCustomer) ? (
            <div className="flex items-center gap-0.5">
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

      {/* Secondary metadata: horizontal cluster (wraps only when narrow). */}
      {hasMetaRow ? (
        <dl className="ws-header-meta mt-0.5 pb-px">
          {channelConnected !== null && channelConnectionLabels ? (
            <div className="shrink-0 text-[10px] leading-tight">
              <span
                className={`inline-flex items-center gap-1 rounded px-1 py-px font-semibold ${
                  channelConnected
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-[var(--ws-danger)]/15 text-[var(--ws-danger)]"
                }`}
                title={channelConnected ? channelConnectionLabels.connected : channelIssueMessage ?? channelConnectionLabels.error}
              >
                {channelConnected ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
                <span dir="auto">{channelConnected ? channelConnectionLabels.connected : channelConnectionLabels.error}</span>
              </span>
            </div>
          ) : null}
          {escalated ? (
            <div className="shrink-0 text-[10px] leading-tight">
              <span className="rounded bg-[var(--ws-warn)]/15 px-1 py-px font-semibold text-[var(--ws-warn)]" dir="auto">
                {labels.escalated}
              </span>
            </div>
          ) : null}
          {customerTone && customerToneLabel ? (
            <div className="shrink-0 text-[10px] leading-tight">
              <span className={`rounded px-1 py-px font-semibold ${toneToneClass}`} dir="auto">
                {customerToneLabel}
              </span>
            </div>
          ) : null}
          {chips.map((chip) => (
            <div key={chip.key} className="shrink-0 text-[10px] leading-tight">
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
      ) : null}
    </div>
  );
});
