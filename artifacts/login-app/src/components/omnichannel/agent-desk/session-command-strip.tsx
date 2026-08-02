import { memo, useMemo } from "react";
import {
  resolveLifecycleActionGroups,
  type LifecycleActionUiId,
} from "@/lib/omnichannel/presentation/lifecycle-action-groups";
import type { LifecycleAction, LifecycleState } from "@/lib/conversation-lifecycle/types/lifecycle-types";

/** Enterprise toolbar — all primary actions visible; only escalation returns in More. */
const PRIMARY_ORDER: LifecycleActionUiId[] = [
  "reply",
  "assign",
  "take_over",
  "return_to_ai",
  "transfer",
  "escalate",
  "resolve",
  "close",
  "reopen",
  "internal_note",
  "open_ai",
];

const ADVANCED_ORDER: LifecycleActionUiId[] = [
  "return_escalation",
  "cancel_escalation",
  "open_assignment",
];

type SessionCommandStripProps = {
  lifecycleState: LifecycleState;
  disabled?: boolean;
  escalated?: boolean;
  isClosed?: boolean;
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
  onTranslate?: () => void;
  onTemplates?: () => void;
};

export const SessionCommandStrip = memo(function SessionCommandStrip(props: SessionCommandStripProps) {
  const groups = useMemo(
    () =>
      resolveLifecycleActionGroups({
        lifecycleState: props.lifecycleState,
        escalated: Boolean(props.escalated),
        isClosed: Boolean(props.isClosed),
        canPerform: props.canPerform,
      }),
    [props.lifecycleState, props.escalated, props.isClosed, props.canPerform],
  );

  const allowed = useMemo(() => {
    const set = new Set<LifecycleActionUiId>([...groups.primary, ...groups.overflow]);
    if (props.canPerform("reply")) {
      set.add("internal_note");
      set.add("open_ai");
    }
    return set;
  }, [groups, props.canPerform]);

  const primary = PRIMARY_ORDER.filter((id) => allowed.has(id));
  const advanced = ADVANCED_ORDER.filter((id) => allowed.has(id) && !primary.includes(id));

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
      link_customer: () => undefined,
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
      open_assignment: "assign",
    };
    return props.labels[keys[id] ?? id] ?? id;
  };

  const btnClass = (id: LifecycleActionUiId) => {
    if (id === "reply") return "agent-desk-btn agent-desk-btn--primary";
    if (id === "escalate") return "agent-desk-btn agent-desk-btn--warn";
    if (id === "resolve") return "agent-desk-btn agent-desk-btn--success";
    if (id === "internal_note") return "agent-desk-btn agent-desk-btn--ghost";
    return "agent-desk-btn";
  };

  if (primary.length === 0 && advanced.length === 0) return null;

  return (
    <div
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--ad-border-subtle)] bg-[var(--ad-surface)] px-2 py-1.5"
      role="toolbar"
      aria-label={props.toolbarLabel}
    >
      {primary.map((id) => (
        <button
          key={id}
          type="button"
          disabled={props.disabled}
          onClick={handler(id)}
          className={`${btnClass(id)} shrink-0 whitespace-nowrap`}
        >
          {label(id)}
        </button>
      ))}
      {props.onTranslate ? (
        <button
          type="button"
          disabled={props.disabled}
          onClick={props.onTranslate}
          className="agent-desk-btn shrink-0 whitespace-nowrap"
        >
          {props.labels.translate}
        </button>
      ) : null}
      {props.onTemplates ? (
        <button
          type="button"
          disabled={props.disabled}
          onClick={props.onTemplates}
          className="agent-desk-btn shrink-0 whitespace-nowrap"
        >
          {props.labels.templates}
        </button>
      ) : null}
      {advanced.length > 0 ? (
        <details className="relative shrink-0">
          <summary className="agent-desk-btn agent-desk-btn--ghost cursor-pointer list-none whitespace-nowrap">
            {props.labels.more}
          </summary>
          <div className="absolute start-0 top-full z-20 mt-1 min-w-[10rem] rounded-md border border-[var(--ad-border)] bg-[var(--ad-surface-raised)] py-1 shadow-xl">
            {advanced.map((id) => (
              <button
                key={id}
                type="button"
                disabled={props.disabled}
                className="block w-full px-3 py-1.5 text-start text-xs hover:bg-[var(--ad-accent-dim)]"
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
