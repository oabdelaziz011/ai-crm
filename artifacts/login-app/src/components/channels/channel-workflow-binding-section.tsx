import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ActiveAutomationFlowOption } from "@/lib/channel-workflow-binding/types";

const NO_WORKFLOW_VALUE = "__none__";

export type ChannelWorkflowBindingSectionProps = {
  workflowEnabled: boolean;
  onWorkflowEnabledChange: (enabled: boolean) => void;
  selectedFlowId: string;
  onSelectedFlowIdChange: (flowId: string) => void;
  flows: ActiveAutomationFlowOption[];
  loading?: boolean;
  disabled?: boolean;
};

export function ChannelWorkflowBindingSection({
  workflowEnabled,
  onWorkflowEnabledChange,
  selectedFlowId,
  onSelectedFlowIdChange,
  flows,
  loading = false,
  disabled = false,
}: ChannelWorkflowBindingSectionProps) {
  const { t } = useTranslation("common");

  return (
    <div
      className="space-y-4 rounded-lg border border-white/10 p-3"
      data-testid="channel-workflow-binding-section"
    >
      <div>
        <p className="text-xs font-medium">{t("dashboard.channels.automationWorkflow.title")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("dashboard.channels.automationWorkflow.helper")}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="channel-workflow-enabled" className="text-sm">
          {t("dashboard.channels.automationWorkflow.enableToggle")}
        </Label>
        <Switch
          id="channel-workflow-enabled"
          data-testid="channel-workflow-enabled"
          checked={workflowEnabled}
          onCheckedChange={onWorkflowEnabledChange}
          disabled={disabled || loading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="channel-workflow-select">
          {t("dashboard.channels.automationWorkflow.workflowLabel")}
        </Label>
        <Select
          value={selectedFlowId || NO_WORKFLOW_VALUE}
          onValueChange={(value) => {
            if (value === NO_WORKFLOW_VALUE) {
              onSelectedFlowIdChange("");
              onWorkflowEnabledChange(false);
              return;
            }
            onSelectedFlowIdChange(value);
          }}
          disabled={disabled || loading || !workflowEnabled}
        >
          <SelectTrigger id="channel-workflow-select" data-testid="channel-workflow-select">
            <SelectValue placeholder={t("dashboard.channels.automationWorkflow.selectWorkflow")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_WORKFLOW_VALUE}>
              {t("dashboard.channels.automationWorkflow.noWorkflow")}
            </SelectItem>
            {flows.map((flow) => (
              <SelectItem key={flow.id} value={flow.id}>
                {flow.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {workflowEnabled && flows.length === 0 && !loading ? (
          <p className="text-xs text-amber-400" data-testid="channel-workflow-empty">
            {t("dashboard.channels.automationWorkflow.noActiveFlows")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
