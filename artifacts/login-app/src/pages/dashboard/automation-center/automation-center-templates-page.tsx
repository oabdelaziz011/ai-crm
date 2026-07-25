import { useTranslation } from "react-i18next";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/ui";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useAutomationActions, useAutomationTemplates } from "@/hooks/automation/use-automation-workflows";
import { WorkflowGraphPreview } from "@/pages/dashboard/automation-center/components/workflow-graph-preview";

export function AutomationCenterTemplatesPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const { data: templates = [], isLoading } = useAutomationTemplates();
  const { installTemplate } = useAutomationActions(companyId);

  const onInstall = (templateKey: string) => {
    installTemplate.mutate(templateKey, {
      onSuccess: () => toast({ title: t("automation.center.templateInstalled") }),
      onError: (error) =>
        toast({ title: t("automation.center.templateInstallFailed"), description: error.message, variant: "destructive" }),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("automation.center.loading")}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {templates.map((template) => (
        <DashboardCard key={template.templateKey ?? template.id} className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold">{template.name}</h3>
              <p className="text-xs text-muted-foreground">{template.trigger.type}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{template.description}</p>
          <WorkflowGraphPreview graph={template.graph} />
          <Button
            size="sm"
            disabled={!companyId || installTemplate.isPending}
            onClick={() => onInstall(template.templateKey ?? template.id)}
          >
            {t("automation.center.installTemplate")}
          </Button>
        </DashboardCard>
      ))}
    </div>
  );
}
