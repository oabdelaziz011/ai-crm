import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { OPERATIONS_CONFIG_TABS } from "@workspace/universal-operations-engine";
import type { OperationsConfigTab } from "@workspace/universal-operations-engine";
import { useOperationsConfigurationEditor } from "@/hooks/universal-operations/use-operations-configuration-editor";
import { WorkspacePanel } from "@/components/customer-workspace/workspace-ui";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OperationsConfigStatusBar } from "@/components/universal-operations/configuration/operations-config-status-bar";
import { OperationsConfigValidationReportPanel } from "@/components/universal-operations/configuration/operations-config-validation-report";
import { OperationsConfigTabContent } from "@/components/universal-operations/configuration/operations-config-tab-content";
import { OperationsConfigEnterpriseToolbar } from "@/components/universal-operations/configuration/operations-config-enterprise-toolbar";

export function OperationsConfigurationPage() {
  const { t } = useTranslation("common");
  const [activeTab, setActiveTab] = useState<OperationsConfigTab>("general");
  const [publishSummary, setPublishSummary] = useState("");
  const [rollbackVersion, setRollbackVersion] = useState<number | null>(null);
  const editor = useOperationsConfigurationEditor();

  const handleSaveDraft = async () => {
    try {
      await editor.saveDraft();
      toast.success(t("universalOperations.configuration.saveSuccess"));
    } catch {
      toast.error(t("universalOperations.configuration.saveError"));
    }
  };

  const handleValidate = async () => {
    try {
      const report = await editor.validate();
      if (report.valid) {
        toast.success(t("universalOperations.configuration.validationPassed"));
      } else {
        toast.error(t("universalOperations.configuration.validationFailed"));
      }
    } catch {
      toast.error(t("universalOperations.configuration.validationFailed"));
    }
  };

  const handlePublish = async () => {
    try {
      await editor.publish(publishSummary || t("universalOperations.configuration.publishNote"));
      toast.success(t("universalOperations.configuration.publishSuccess"));
    } catch {
      toast.error(t("universalOperations.configuration.publishError"));
    }
  };

  const handleRollback = async (version: number) => {
    try {
      await editor.rollback(version);
      toast.success(t("universalOperations.configuration.advanced.rollbackSuccess"));
    } catch {
      toast.error(t("universalOperations.configuration.advanced.rollbackError"));
    }
  };

  if (editor.isLoading || !editor.draft) {
    return (
      <WorkspacePanel title={t("universalOperations.configuration.title")}>
        <p className="text-sm text-muted-foreground">{t("universalOperations.configuration.loading")}</p>
      </WorkspacePanel>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">{t("universalOperations.configuration.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("universalOperations.configuration.subtitle")}</p>
      </div>

      <OperationsConfigStatusBar
        templateKey={editor.templateKey}
        onTemplateKeyChange={editor.setTemplateKey}
        status={editor.hasUnpublishedDraft ? "draft" : "published"}
        hasUnpublishedDraft={editor.hasUnpublishedDraft}
        publishedVersion={editor.publishedVersion}
        isDirty={editor.isDirty}
        isSaving={editor.isSaving}
        isPublishing={editor.isPublishing}
        isValidating={editor.isValidating}
        onSaveDraft={() => void handleSaveDraft()}
        onValidate={() => void handleValidate()}
        onPublish={() => void handlePublish()}
      />

      <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center">
        <Label className="text-xs">{t("universalOperations.configuration.enterprise.publishSummary")}</Label>
        <Input
          value={publishSummary}
          onChange={(e) => setPublishSummary(e.target.value)}
          placeholder={t("universalOperations.configuration.publishNote")}
          className="h-8 text-xs"
        />
      </div>

      <OperationsConfigEnterpriseToolbar editor={editor} activeTab={activeTab} />

      <OperationsConfigValidationReportPanel report={editor.validationReport} />

      <nav className="flex flex-wrap gap-2 border-b border-border/60 pb-3">
        {OPERATIONS_CONFIG_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              activeTab === tab ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/40",
            )}
          >
            {t(`universalOperations.configuration.tabs.${tab}`)}
          </button>
        ))}
      </nav>

      <OperationsConfigTabContent
        tab={activeTab}
        draft={editor.draft}
        updateDraft={editor.updateDraft}
        versions={editor.versions}
        onRollback={(version) => setRollbackVersion(version)}
        onCompareVersion={(version) => editor.compareWithVersion(version)}
      />

      <AlertDialog open={rollbackVersion !== null} onOpenChange={(open) => !open && setRollbackVersion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("universalOperations.configuration.advanced.rollback")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("universalOperations.configuration.enterprise.rollbackConfirm", { version: rollbackVersion ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("buttons.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (rollbackVersion !== null) void handleRollback(rollbackVersion);
                setRollbackVersion(null);
              }}
            >
              {t("universalOperations.configuration.advanced.rollback")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
