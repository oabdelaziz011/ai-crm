import { memo, useMemo } from "react";
import {
  resolveLifecycleActionGroups,
  type LifecycleActionUiId,
} from "@/lib/omnichannel/presentation/lifecycle-action-groups";
import type { LifecycleAction, LifecycleState } from "@/lib/conversation-lifecycle/types/lifecycle-types";

const TOOLBAR_ORDER: LifecycleActionUiId[] = [
  "reply",
  "internal_note",
  "open_ai",
  "assign",
  "take_over",
  "return_to_ai",
  "escalate",
  "resolve",
  "close",
  "reopen",
  "transfer",
  "link_customer",
  "return_escalation",
  "cancel_escalation",
];

type WorkspaceActionToolbarProps = {
  lifecycleState: LifecycleState;
  disabled?: boolean;
  escalated?: boolean;
  isClosed?: boolean;
  showLinkCustomer?: boolean;
  canPerform: (action: LifecycleAction) => boolean;
  toolbarLabel: string;
  labels: Record<string, string>;
  onReply: () => void;
  onInternalNote: () => void;
  onOpenAi: () => void;
  onTakeOver: () => void;
  onAssign: () => void;
  onOpenAssignment: () => void;
  onRelease: () => void;
  onClose: () => void;
  onResolve?: () => void;
  onReopen?: () => void;
  onEscalate: () => void;
  onReturnConversation: () => void;
  onCancelEscalation: () => void;
  onLinkCustomer?: () => void;
};

export const WorkspaceActionToolbar = memo(function WorkspaceActionToolbar(props: WorkspaceActionToolbarProps) {
  const groups = useMemo(
    () =>
      resolveLifecycleActionGroups({
        lifecycleState: props.lifecycleState,
        escalated: Boolean(props.escalated),
        isClosed: Boolean(props.isClosed),
        canPerform: props.canPerform,
        showLinkCustomer: props.showLinkCustomer,
      }),
    [props.lifecycleState, props.escalated, props.isClosed, props.canPerform, props.showLinkCustomer],
  );

  const visibleSet = useMemo(
    () => new Set<LifecycleActionUiId>([...groups.primary, ...groups.overflow]),
    [groups],
  );

  const visible = TOOLBAR_ORDER.filter((id) => visibleSet.has(id));
  const more = groups.overflow.filter((id) => !visible.includes(id));

  const handler = (id: LifecycleActionUiId) => {
    const map: Record<LifecycleActionUiId, () => void> = {
      reply: props.onReply,
      internal_note: props.onInternalNote,
      open_ai: props.onOpenAi,
      take_over: props.onTakeOver,
      assign: props.onAssign,
      transfer: props.onOpenAssignment,
      escalate: props.onEscalate,
      return_to_ai: props.onRelease,
      resolve: () => props.onResolve?.(),
      close: props.onClose,
      reopen: () => props.onReopen?.(),
      return_escalation: props.onReturnConversation,
      cancel_escalation: props.onCancelEscalation,
      open_assignment: props.onOpenAssignment,
      link_customer: () => props.onLinkCustomer?.(),
    };
    return map[id] ?? (() => undefined);
  };

  const label = (id: LifecycleActionUiId) => {
    const keys: Record<string, string> = {
      reply: "reply",
      internal_note: "internalNote",
      open_ai: "aiAssist",
      take_over: "takeOver",
      assign: "assign",
      transfer: "transfer",
      escalate: "escalate",
      return_to_ai: "returnToAi",
      resolve: "resolve",
      close: "close",
      reopen: "reopen",
      return_escalation: "returnConversation",
      cancel_escalation: "cancelEscalation",
      link_customer: "linkCustomer",
    };
    return props.labels[keys[id] ?? id] ?? id;
  };

  const buttonClass = (id: LifecycleActionUiId) => {
    if (id === "reply") return "ws-btn--primary";
    if (id === "escalate") return "ws-btn--warn";
    if (id === "resolve") return "ws-btn--success";
    if (id === "open_ai") return "ws-btn--ghost";
    if (id === "take_over") return "ws-btn--accent";
    return "";
  };

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[var(--ws-border-subtle)] px-2 py-1.5"
      role="toolbar"
      aria-label={props.toolbarLabel}
    >
      {visible.map((id) => (
        <button
          key={id}
          type="button"
          disabled={props.disabled}
          onClick={handler(id)}
          className={`ws-btn ${buttonClass(id)}`}
        >
          {label(id)}
        </button>
      ))}
      {more.length > 0 ? (
        <details className="relative">
          <summary className="ws-btn ws-btn--ghost cursor-pointer list-none">{props.labels.more}</summary>
          <div className="absolute start-0 top-full z-20 mt-1 min-w-[10rem] rounded-md border border-[var(--ws-border)] bg-[var(--ws-surface-2)] py-1 shadow-xl">
            {more.map((id) => (
              <button
                key={id}
                type="button"
                disabled={props.disabled}
                className="block w-full px-3 py-1.5 text-start text-xs hover:bg-[var(--ws-accent-dim)]"
                onClick={handler(id)}
              >
                {label(id)}
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
});
