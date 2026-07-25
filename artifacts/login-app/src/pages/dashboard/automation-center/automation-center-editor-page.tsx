import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRoute } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardCard } from "@/components/dashboard/ui";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  useAutomationActions,
  useAutomationWorkflow,
} from "@/hooks/automation/use-automation-workflows";
import type { AutomationActionType, AutomationDelayType, AutomationTriggerType } from "@/lib/automation/types";
import { listSupportedTriggerTypes } from "@/lib/automation/triggers/trigger-registry";
import { WorkflowGraphPreview } from "@/pages/dashboard/automation-center/components/workflow-graph-preview";

const ACTION_TYPES: AutomationActionType[] = [
  "create_notification",
  "send_email",
  "send_whatsapp",
  "internal_notification",
];

const DELAY_TYPES: AutomationDelayType[] = [
  "immediate",
  "after_minutes",
  "after_hours",
  "after_days",
  "before_appointment",
  "at_specific_time",
];

export function AutomationCenterEditorPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const [, params] = useRoute("/dashboard/automation/center/editor/:workflowId");
  const workflowId = params?.workflowId ?? null;

  const { data: workflow, isLoading } = useAutomationWorkflow(companyId, workflowId);
  const { updateWorkflow } = useAutomationActions(companyId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>("system_event");
  const [delayType, setDelayType] = useState<AutomationDelayType>("immediate");
  const [actionType, setActionType] = useState<AutomationActionType>("internal_notification");

  useEffect(() => {
    if (!workflow) return;
    setName(workflow.name);
    setDescription(workflow.description);
    setTriggerType(workflow.trigger.type);
    setDelayType(workflow.schedule.type);
    setActionType(workflow.actions[0]?.type ?? "internal_notification");
  }, [workflow]);

  const onSave = () => {
    if (!workflowId) return;
    updateWorkflow.mutate(
      {
        workflowId,
        input: {
          name,
          description,
          trigger: { type: triggerType },
          schedule: { type: delayType },
          actions: [{ type: actionType, enabled: true }],
        },
      },
      {
        onSuccess: () => toast({ title: t("automation.center.saved") }),
        onError: (error) =>
          toast({ title: t("automation.center.saveFailed"), description: error.message, variant: "destructive" }),
      },
    );
  };

  if (isLoading || !workflow) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("automation.center.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardCard className="p-6 space-y-4">
        <h3 className="font-semibold">{t("automation.center.editor.title")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("automation.center.editor.name")}</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("automation.center.editor.description")}</Label>
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>{t("automation.center.editor.trigger")}</Label>
            <Select value={triggerType} onValueChange={(value) => setTriggerType(value as AutomationTriggerType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {listSupportedTriggerTypes().map((type) => (
                  <SelectItem key={type} value={type}>{t(`automation.triggers.${type}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("automation.center.editor.delay")}</Label>
            <Select value={delayType} onValueChange={(value) => setDelayType(value as AutomationDelayType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DELAY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{t(`automation.delays.${type}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("automation.center.editor.action")}</Label>
            <Select value={actionType} onValueChange={(value) => setActionType(value as AutomationActionType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{t(`automation.actions.${type}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={onSave} disabled={updateWorkflow.isPending}>
          {updateWorkflow.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {t("buttons.save")}
        </Button>
      </DashboardCard>

      <DashboardCard className="p-6 space-y-3">
        <h3 className="font-semibold">{t("automation.center.editor.graph")}</h3>
        <WorkflowGraphPreview graph={workflow.graph} />
      </DashboardCard>
    </div>
  );
}
