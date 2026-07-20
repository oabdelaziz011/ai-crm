import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Plus, Workflow } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { nestedSectionHref } from "@/lib/routing";
import { WorkflowStatusBadge } from "@/workflow-builder/components/lifecycle/workflow-status-badge";
import { useWorkflowBuilderServices } from "@/workflow-builder/context/workflow-builder-services";

export function AutomationWorkflowsPage() {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { repository, context } = useWorkflowBuilderServices();
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const companyId = context.companyId ?? "";

  const workflowsQuery = useQuery({
    queryKey: ["automation-workflows", companyId],
    enabled: Boolean(companyId),
    queryFn: () => repository.list(companyId),
  });

  const createWorkflow = async () => {
    if (!companyId || !name.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const document = await repository.create(context, { companyId, name: name.trim() });
      setLocation(nestedSectionHref(document.flowId));
    } catch (error) {
      toast({
        title: t("workflowBuilder.list.createFailed"),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const workflows = workflowsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/80 p-5 shadow-lg md:flex-row md:items-end">
        <div className="flex-1 space-y-2">
          <label className="text-sm font-medium">{t("workflowBuilder.list.newName")}</label>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("workflowBuilder.list.newNamePlaceholder")}
            className="rounded-xl"
          />
        </div>
        <Button type="button" className="rounded-xl" onClick={() => void createWorkflow()} disabled={!name.trim() || !context.hasPermission("automation.create") || isCreating}>
          <Plus className="mr-2 h-4 w-4" />
          {t("workflowBuilder.list.create")}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workflows.map((workflow) => (
          <button
            key={workflow.flowId}
            type="button"
            onClick={() => setLocation(nestedSectionHref(workflow.flowId))}
            className="rounded-2xl border border-border/60 bg-card/80 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-3 text-primary">
                <Workflow className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">{workflow.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <WorkflowStatusBadge status={workflow.status} hasUnpublishedDraft={workflow.hasUnpublishedDraft} />
                  {workflow.activeVersionNumber ? (
                    <span className="text-xs text-muted-foreground">v{workflow.activeVersionNumber}</span>
                  ) : null}
                </div>
              </div>
            </div>
            <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
              {workflow.description || t("workflowBuilder.list.emptyDescription")}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
