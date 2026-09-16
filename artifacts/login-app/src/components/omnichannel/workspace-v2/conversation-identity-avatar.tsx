import { memo } from "react";
import { cn } from "@/lib/utils";
import { ChannelMark } from "@/components/omnichannel/channel-mark";
import type { ConversationIdentityAvatarModel } from "@/lib/omnichannel/presentation/conversation-identity-avatar";
import { buildConversationIdentityInitials } from "@/lib/omnichannel/presentation/conversation-identity-avatar";

type ConversationIdentityAvatarProps = {
  /** Preferred: shared resolver model (list + header + CRM). */
  identity?: ConversationIdentityAvatarModel | null;
  /** Legacy/simple props when identity model is not passed. */
  displayName?: string;
  channel?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Optional real image URL — only render when callers have a verified stored URL. */
  imageUrl?: string | null;
  /** Corner channel mark (visual density). Channel badge elsewhere remains the independent channel signal. */
  showChannelMark?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  title?: string;
};

const SIZE = {
  sm: { box: "size-9 text-[11px]", mark: "size-3.5" },
  md: { box: "size-10 text-[12px]", mark: "size-4" },
  lg: { box: "size-11 text-[13px]", mark: "size-4" },
} as const;

/**
 * Conversation/customer avatar from real data only.
 * Prefer `identity` from `resolveConversationIdentityAvatar` (shared list/header/CRM).
 * Image renders solely when a verified URL is present — never invented.
 */
export const ConversationIdentityAvatar = memo(function ConversationIdentityAvatar({
  identity,
  displayName: displayNameProp,
  channel: channelProp,
  size = "md",
  className,
  imageUrl: imageUrlProp,
  showChannelMark = true,
  onClick,
  ariaLabel,
  title,
}: ConversationIdentityAvatarProps) {
  const displayName = identity?.displayName ?? displayNameProp ?? "?";
  const channel = identity?.channel ?? channelProp ?? "web_chat";
  const imageUrl = identity?.imageUrl ?? imageUrlProp ?? null;
  const initials = identity?.initials ?? buildConversationIdentityInitials(displayName);
  const dims = SIZE[size];

  const content = imageUrl ? (
    <img
      src={imageUrl}
      alt=""
      className="size-full rounded-full object-cover"
      referrerPolicy="no-referrer"
    />
  ) : (
    <span aria-hidden>{initials}</span>
  );

  const shellClass = cn(
    "relative flex shrink-0 items-center justify-center rounded-full bg-[var(--ws-surface-2)] font-bold text-[var(--ws-text)] ring-2 ring-[var(--ws-border)]",
    dims.box,
    onClick && "hover:ring-[var(--ws-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ws-accent)]",
    className,
  );

  const mark = showChannelMark ? (
    <span
      className={cn(
        "absolute -bottom-0.5 -end-0.5 flex items-center justify-center rounded-full bg-[var(--ws-surface)] p-0.5 shadow-sm ring-1 ring-[var(--ws-border)]",
        dims.mark,
      )}
      aria-hidden
    >
      <ChannelMark channel={channel} className="size-full" />
    </span>
  ) : null;

  if (onClick) {
    return (
      <button type="button" className={shellClass} onClick={onClick} aria-label={ariaLabel} title={title}>
        {content}
        {mark}
      </button>
    );
  }

  return (
    <div className={shellClass} title={title} aria-label={ariaLabel}>
      {content}
      {mark}
    </div>
  );
});
