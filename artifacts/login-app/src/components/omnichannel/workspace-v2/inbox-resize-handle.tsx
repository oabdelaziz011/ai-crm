import { memo } from "react";

type InboxResizeHandleProps = {
  enabled: boolean;
  ariaLabel: string;
  onResizeStart: (clientX: number) => void;
};

/**
 * Thin column divider between Conversation and Inbox.
 * Width updates are applied outside React (CSS variable) by the parent hook.
 */
export const InboxResizeHandle = memo(function InboxResizeHandle({
  enabled,
  ariaLabel,
  onResizeStart,
}: InboxResizeHandleProps) {
  if (!enabled) {
    return <div className="ws-inbox-resize-handle ws-inbox-resize-handle--disabled" aria-hidden />;
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-orientation="vertical"
      className="ws-inbox-resize-handle"
      onPointerDown={(event) => {
        event.preventDefault();
        onResizeStart(event.clientX);
      }}
    />
  );
});
