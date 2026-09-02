import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Circle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AGENT_PRESENCE_UI_STATES,
  type AgentPresenceUiState,
  useAgentPresence,
} from "@/hooks/omnichannel/use-agent-presence";
import { cn } from "@/lib/utils";

const STATE_DOT: Record<AgentPresenceUiState, string> = {
  online: "text-emerald-500",
  busy: "text-amber-500",
  away: "text-orange-400",
  offline: "text-muted-foreground",
};

type AgentPresenceControlProps = {
  companyId: string | null;
  className?: string;
  compact?: boolean;
};

export const AgentPresenceControl = memo(function AgentPresenceControl({
  companyId,
  className,
  compact = false,
}: AgentPresenceControlProps) {
  const { t } = useTranslation("common");
  const presence = useAgentPresence(companyId);

  const labelFor = (state: AgentPresenceUiState) =>
    t(`omnichannel.agentPresence.states.${state}`, { defaultValue: state });

  const displayState = (presence.currentState &&
  (AGENT_PRESENCE_UI_STATES as readonly string[]).includes(presence.currentState)
    ? presence.currentState
    : "offline") as AgentPresenceUiState;

  const helper = useMemo(() => {
    if (!presence.canView && !presence.canUpdate) {
      return t("omnichannel.agentPresence.permissionDenied");
    }
    if (presence.error) {
      const message =
        presence.error instanceof Error ? presence.error.message : String(presence.error);
      return message;
    }
    if (presence.isLoading) return t("omnichannel.agentPresence.loading");
    return null;
  }, [presence.canView, presence.canUpdate, presence.error, presence.isLoading, t]);

  if (!companyId) return null;
  if (!presence.canView && !presence.canUpdate) return null;

  return (
    <div
      className={cn("flex min-w-0 flex-col gap-0.5", className)}
      data-testid="agent-presence-control"
    >
      <div className={cn("flex items-center gap-2", compact ? "min-w-[9.5rem]" : "min-w-[11rem]")}>
        {!compact ? (
          <span className="shrink-0 text-[11px] text-[var(--ws-muted)]">
            {t("omnichannel.agentPresence.label")}
          </span>
        ) : null}
        <Select
          value={displayState}
          disabled={!presence.canUpdate || presence.isUpdating || presence.isLoading}
          onValueChange={(value) => {
            void presence.setPresence(value as AgentPresenceUiState);
          }}
        >
          <SelectTrigger
            aria-label={t("omnichannel.agentPresence.label")}
            className="h-8 w-full min-w-[8.5rem] border-[var(--ws-border)] bg-[var(--ws-surface)] text-xs"
          >
            <SelectValue>
              <span className="inline-flex items-center gap-1.5">
                <Circle className={cn("size-2.5 fill-current", STATE_DOT[displayState])} aria-hidden />
                {labelFor(displayState)}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            {presence.uiStates.map((state) => (
              <SelectItem key={state} value={state} className="text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <Circle className={cn("size-2.5 fill-current", STATE_DOT[state])} aria-hidden />
                  {labelFor(state)}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {helper ? (
        <p
          className={cn(
            "truncate text-[10px] leading-tight",
            presence.error ? "text-destructive" : "text-[var(--ws-muted)]",
          )}
          title={helper}
        >
          {helper}
        </p>
      ) : null}
    </div>
  );
});
