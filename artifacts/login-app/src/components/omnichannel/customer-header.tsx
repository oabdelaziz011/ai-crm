import { memo } from "react";
import { formatDistanceToNow } from "date-fns";
import { Crown, Mail, Phone, Timer, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChannelBadge, HandlerModeBadge } from "@/components/omnichannel/channel-badge";
import type { ConversationHeader } from "@/lib/conversation-lifecycle/types/lifecycle-types";
import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";

type CustomerHeaderProps = {
  header: ConversationHeader;
  handlerMode: UnifiedConversation["handlerMode"];
  labels: {
    unknownContact: string;
    createCustomer: string;
    linkCustomer: string;
    vip: string;
    owner: string;
    unassigned: string;
    escalated: string;
    status: string;
    sla: string;
    language: string;
    lastActivity: string;
  };
  escalated?: boolean;
  languageLabel?: string;
  lastActivityAt?: string | null;
  canLinkCustomer?: boolean;
  canCreateCustomer?: boolean;
  onCreateCustomer?: () => void;
  onLinkCustomer?: () => void;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export const CustomerHeader = memo(function CustomerHeader({
  header,
  handlerMode,
  labels,
  escalated,
  languageLabel,
  lastActivityAt,
  canLinkCustomer = true,
  canCreateCustomer = true,
  onCreateCustomer,
  onLinkCustomer,
}: CustomerHeaderProps) {
  const displayName = header.customer.name?.trim() || labels.unknownContact;
  const phone = header.customer.phone;
  const email = header.customer.email;
  const isVip = header.priority === "urgent" || header.priority === "high";
  const slaLabel = header.sla.label ?? "—";
  const displayState = header.lifecycleState;
  const ownerLabel = header.owner.label ?? labels.unassigned;
  const hasCustomer = Boolean(header.customer.id);

  return (
    <header className="border-b border-white/[0.06] px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <div
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary ring-2 ring-primary/10"
            aria-hidden
          >
            {initials(displayName)}
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold tracking-tight">{displayName}</h2>
              {isVip ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                  <Crown className="size-3" />
                  {labels.vip}
                </span>
              ) : null}
              {escalated ? (
                <span className="rounded-full border border-rose-400/25 bg-rose-400/10 px-2 py-0.5 text-[10px] text-rose-200">
                  {labels.escalated}
                </span>
              ) : null}
              <ChannelBadge channel={header.channel} />
              <HandlerModeBadge mode={handlerMode} aiLabel="AI" humanLabel="Human" />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {phone ? (
                <span className="inline-flex items-center gap-1.5" dir="ltr">
                  <Phone className="size-3.5 shrink-0" />
                  {phone}
                </span>
              ) : null}
              {email ? (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5 shrink-0" />
                  {email}
                </span>
              ) : null}
              {languageLabel ? (
                <span className="inline-flex items-center gap-1.5">
                  {labels.language}: {languageLabel}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span>
                {labels.owner}: <span className="text-foreground/90">{ownerLabel}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Timer className="size-3" />
                {labels.sla}: {slaLabel}
              </span>
              <span className="capitalize">
                {labels.status}: {displayState.replace(/_/g, " ").toLowerCase()}
              </span>
              {lastActivityAt ? (
                <span>
                  {labels.lastActivity}: {formatDistanceToNow(new Date(lastActivityAt), { addSuffix: true })}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {!hasCustomer && (canCreateCustomer || canLinkCustomer) ? (
          <div className="flex flex-wrap gap-2">
            {phone ? (
              <p className="w-full text-sm text-muted-foreground" dir="ltr">
                {phone}
              </p>
            ) : null}
            {canCreateCustomer ? (
              <Button size="sm" variant="outline" onClick={onCreateCustomer}>
                <UserPlus className="size-3.5" />
                {labels.createCustomer}
              </Button>
            ) : null}
            {canLinkCustomer ? (
              <Button size="sm" variant="secondary" onClick={onLinkCustomer}>
                {labels.linkCustomer}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
});
