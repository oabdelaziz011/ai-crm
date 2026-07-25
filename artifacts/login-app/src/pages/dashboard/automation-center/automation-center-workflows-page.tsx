import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { Loader2, Play, Plus, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DashboardCard } from "@/components/dashboard/ui";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useAutomationActions, useAutomationWorkflows } from "@/hooks/automation/use-automation-workflows";

export function AutomationCenterWorkflowsPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const { data: workflows = [], isLoading } = useAutomationWorkflows(companyId);
  const { createWorkflow, setEnabled, runManual, processDueSchedules } = useAutomationActions(companyId);

  const [name, setName] = useState("");

  const onCreate = () => {
    if (!name.trim()) return;
    createWorkflow.mutate(
      {
        name: name.trim(),
        trigger: { type: "system_event" },
        actions: [{ type: "internal_notification", enabled: true }],
      },
      {
        onSuccess: (workflow) => {
          setName("");
          setLocation(`/dashboard/automation/center/editor/${workflow.id}`);
        },
        onError: (error) =>
          toast({ title: t("automation.center.createFailed"), description: error.message, variant: "destructive" }),
      },
    );
  };

  if (!companyId) {
    return (
      <DashboardCard className="p-6">
        <p className="text-sm text-muted-foreground">{t("notifications.noCompany")}</p>
      </DashboardCard>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardCard className="p-5 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium">{t("automation.center.newWorkflow")}</label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("automation.center.newWorkflowPlaceholder")} />
          </div>
          <Button onClick={onCreate} disabled={createWorkflow.isPending || !name.trim()}>
            {createWorkflow.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {t("automation.center.create")}
          </Button>
          <Button variant="outline" onClick={() => processDueSchedules.mutate()} disabled={processDueSchedules.isPending}>
            {t("automation.center.processSchedules")}
          </Button>
        </div>
      </DashboardCard>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("automation.center.loading")}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workflows.map((workflow) => (
            <DashboardCard key={workflow.id} className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-primary/10 p-2 text-primary">
                    <Workflow className="w-4 h-4" />
                  </div>
                  <div>
                    <Link href={`/dashboard/automation/center/editor/${workflow.id}`} className="font-semibold hover:underline">
                      {workflow.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">v{workflow.version} · {workflow.trigger.type}</p>
                  </div>
                </div>
                <Switch
                  checked={workflow.enabled}
                  onCheckedChange={(enabled) => setEnabled.mutate({ workflowId: workflow.id, enabled })}
                />
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{workflow.description || "—"}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={runManual.isPending}
                  onClick={() =>
                    runManual.mutate(workflow.id, {
                      onSuccess: () => toast({ title: t("automation.center.manualRunSuccess") }),
                      onError: (error) =>
                        toast({ title: t("automation.center.manualRunFailed"), description: error.message, variant: "destructive" }),
                    })
                  }
                >
                  <Play className="w-3.5 h-3.5 mr-1" />
                  {t("automation.center.manualRun")}
                </Button>
              </div>
            </DashboardCard>
          ))}
        </div>
      )}
    </div>
  );
}
