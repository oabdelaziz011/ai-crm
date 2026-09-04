import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Bot, History, Layers, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Profile } from "@/lib/types";
import type { LifecycleSnapshot } from "@/lib/conversation-lifecycle";
import type { OperationalAssignmentRecord } from "@/lib/conversation-lifecycle";
import { useAiEmployees } from "@/lib/ai-employees/hooks/use-ai-employees";
import { useAssignmentTargets } from "@/hooks/omnichannel/use-assignment-targets";
import type { useConversationHandoffOwnership } from "@/hooks/omnichannel/use-conversation-handoff-ownership";
import { cn } from "@/lib/utils";

type AssignmentTarget = {
  targetType: OperationalAssignmentRecord["targetType"];
  targetId: string;
  targetLabel: string;
};

type AssignmentSheetProps = {
  open: boolean;
  companyId: string | null;
  /** CVP handoff pause state — same boolean used by workspace pause/resume controls. */
  handoffAiPaused?: boolean;
  handoffOwnership?: ReturnType<typeof useConversationHandoffOwnership>;
  profiles: Profile[];
  lifecycleSnapshot?: LifecycleSnapshot | null;
  onOpenChange: (open: boolean) => void;
  onAssign: (target: AssignmentTarget) => void;
};

export const AssignmentSheet = memo(function AssignmentSheet({
  open,
  companyId,
  handoffAiPaused: _handoffAiPaused,
  handoffOwnership: _handoffOwnership,
  profiles,
  lifecycleSnapshot,
  onOpenChange,
  onAssign,
}: AssignmentSheetProps) {
  const { t } = useTranslation("common");
  const aiEmployeesQuery = useAiEmployees(companyId, { status: "published" });
  const targetsQuery = useAssignmentTargets(companyId);

  const agents = useMemo(
    () =>
      profiles
        .filter((profile) => profile.user_id)
        .map((profile) => ({
          targetType: "user" as const,
          targetId: profile.user_id!,
          targetLabel: profile.full_name?.trim() || profile.email || profile.user_id!,
        })),
    [profiles],
  );

  const aiEmployees = useMemo(
    () =>
      (aiEmployeesQuery.data ?? []).map((employee) => ({
        targetType: "ai_employee" as const,
        targetId: employee.id,
        targetLabel: employee.displayName?.trim() || employee.name,
      })),
    [aiEmployeesQuery.data],
  );

  const teams = useMemo(() => {
    return (targetsQuery.data?.teams ?? []).map((team) => ({
      targetType: "team" as const,
      targetId: team.targetId,
      targetLabel: team.targetLabel,
    }));
  }, [targetsQuery.data?.teams]);

  const queues = targetsQuery.data?.queues ?? [];

  const history = lifecycleSnapshot?.assignmentHistory ?? [];

  const handleAssign = (target: AssignmentTarget) => {
    onAssign(target);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users className="size-4" />
            {t("omnichannel.actions.assign")}
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="agents" className="flex min-h-0 flex-1 flex-col pt-2">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="agents">{t("omnichannel.assignment.user")}</TabsTrigger>
            <TabsTrigger value="teams">{t("omnichannel.assignment.team")}</TabsTrigger>
            <TabsTrigger value="queues">{t("omnichannel.assignment.queue")}</TabsTrigger>
            <TabsTrigger value="ai">{t("omnichannel.assignment.aiEmployee")}</TabsTrigger>
          </TabsList>

          <TabsContent value="agents" className="mt-3 flex-1 space-y-2 overflow-y-auto">
            {agents.length > 0 ? (
              agents.map((agent) => (
                <TargetCard
                  key={agent.targetId}
                  icon={User}
                  label={agent.targetLabel}
                  assignLabel={t("omnichannel.actions.assign")}
                  onClick={() => handleAssign(agent)}
                />
              ))
            ) : (
              <EmptyTargets message={t("omnichannel.assignment.noAgents")} />
            )}
          </TabsContent>

          <TabsContent value="teams" className="mt-3 flex-1 space-y-2 overflow-y-auto">
            {targetsQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">{t("status.loading")}</p>
            ) : teams.length > 0 ? (
              teams.map((target) => (
                <TargetCard
                  key={target.targetId}
                  icon={Users}
                  label={target.targetLabel}
                  assignLabel={t("omnichannel.actions.assign")}
                  onClick={() => handleAssign(target)}
                />
              ))
            ) : (
              <EmptyTargets message={t("omnichannel.assignment.noTeams")} />
            )}
          </TabsContent>

          <TabsContent value="queues" className="mt-3 flex-1 space-y-2 overflow-y-auto">
            {targetsQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">{t("status.loading")}</p>
            ) : targetsQuery.isError ? (
              <EmptyTargets
                message={
                  targetsQuery.error instanceof Error
                    ? targetsQuery.error.message
                    : t("omnichannel.assignment.queuesLoadFailed")
                }
              />
            ) : queues.length > 0 ? (
              queues.map((target) => (
                <TargetCard
                  key={target.targetId}
                  icon={Layers}
                  label={target.targetLabel}
                  assignLabel={t("omnichannel.actions.assign")}
                  meta={[
                    target.routingStrategy
                      ? t("omnichannel.assignment.routingStrategy", {
                          strategy: target.routingStrategy,
                        })
                      : null,
                    typeof target.onlineMemberCount === "number"
                      ? t("omnichannel.assignment.onlineMembers", {
                          count: target.onlineMemberCount,
                          total: target.memberCount ?? 0,
                        })
                      : null,
                    typeof target.totalActiveConversations === "number"
                      ? t("omnichannel.assignment.activeWorkload", {
                          count: target.totalActiveConversations,
                        })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  onClick={() =>
                    handleAssign({
                      targetType: "queue",
                      targetId: target.targetId,
                      targetLabel: target.targetLabel,
                    })
                  }
                />
              ))
            ) : (
              <EmptyTargets message={t("omnichannel.assignment.noHandoffQueues")} />
            )}
          </TabsContent>

          <TabsContent value="ai" className="mt-3 space-y-2 overflow-y-auto">
            {aiEmployeesQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">{t("status.loading")}</p>
            ) : aiEmployees.length > 0 ? (
              aiEmployees.map((target) => (
                <TargetCard
                  key={target.targetId}
                  icon={Bot}
                  label={target.targetLabel}
                  tone="ai"
                  assignLabel={t("omnichannel.actions.assign")}
                  onClick={() => handleAssign(target)}
                />
              ))
            ) : (
              <EmptyTargets message={t("omnichannel.assignment.noAiEmployees")} />
            )}
          </TabsContent>
        </Tabs>

        {history.length > 0 ? (
          <div className="mt-4 border-t border-border pt-4">
            <Label className="mb-2 flex items-center gap-1.5 text-xs">
              <History className="size-3.5" />
              {t("omnichannel.assignment.history")}
            </Label>
            <ul className="max-h-28 space-y-1 overflow-y-auto text-xs text-muted-foreground">
              {history.map((entry) => (
                <li key={entry.id}>
                  {entry.targetLabel} ({entry.targetType}) · {new Date(entry.assignedAt).toLocaleString()}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
});

function EmptyTargets({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
      {message}
    </div>
  );
}

function TargetCard({
  icon: Icon,
  label,
  meta,
  tone,
  assignLabel,
  onClick,
}: {
  icon: typeof User;
  label: string;
  meta?: string;
  tone?: "ai";
  assignLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-start transition-colors hover:bg-accent",
        tone === "ai" ? "border-primary/20 bg-primary/5" : "border-border",
      )}
    >
      <div
        className={cn(
          "flex size-9 items-center justify-center rounded-lg",
          tone === "ai" ? "bg-primary/15 text-primary" : "bg-muted",
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        {meta ? <p className="truncate text-[11px] text-muted-foreground">{meta}</p> : null}
      </div>
      <Button size="sm" variant="secondary" className="h-7 shrink-0 text-xs">
        {assignLabel}
      </Button>
    </button>
  );
}
