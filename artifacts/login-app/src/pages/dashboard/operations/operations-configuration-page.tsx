import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { OperationsConfigTab } from "@workspace/universal-operations-engine";
import { useOperationsConfigurationEditor } from "@/hooks/universal-operations/use-operations-configuration-editor";
import { WorkspacePanel } from "@/components/customer-workspace/workspace-ui";
import { DashboardErrorBanner } from "@/components/dashboard/ui";
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
import { OperationsConfigDiffDialog } from "@/components/universal-operations/configuration/operations-config-diff-dialog";
import { OperationsConfigWorkflowGuide } from "@/components/universal-operations/configuration/operations-config-workflow-guide";
import { OperationsConfigNav } from "@/components/universal-operations/configuration/operations-config-nav";
import { OperationsConfigTabIntro } from "@/components/universal-operations/configuration/operations-config-tab-intro";

export function OperationsConfigurationPage() {
  const { t } = useTranslation("common");
  const [activeTab, setActiveTab] = useState<OperationsConfigTab>("general");
  const [publishSummary, setPublishSummary] = useState("");
  const [rollbackVersion, setRollbackVersion] = useState<number | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const editor = useOperationsConfigurationEditor();
  const readOnly = !editor.canWrite;
  const isLive = !editor.hasUnpublishedDraft && editor.status === "published";

  const handleSaveDraft = async () => {
    try {
      await editor.saveDraft();
      toast.success(t("universalOperations.configuration.saveSuccess"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("universalOperations.configuration.saveError"));
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
      await editor.publish(publishSummary || t("universalOperations.configuration.publishNoteDefault"));
      toast.success(t("universalOperations.configuration.publishSuccess"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("universalOperations.configuration.publishError"));
    }
  };

  const handleRollback = async (version: number) => {
    try {
      await editor.rollback(version);
      toast.success(t("universalOperations.configuration.advanced.rollbackSuccess"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("universalOperations.configuration.advanced.rollbackError"));
    }
  };

  const handleCompareVersion = (version: number) => {
    editor.compareWithVersion(version);
    setDiffOpen(true);
  };

  if (editor.isLoading) {
    return (
      <WorkspacePanel title={t("universalOperations.configuration.title")}>
        <p className="text-sm text-muted-foreground">{t("universalOperations.configuration.loading")}</p>
      </WorkspacePanel>
    );
  }

  if (editor.isError) {
    return (
      <DashboardErrorBanner
        message={editor.error instanceof Error ? editor.error.message : t("universalOperations.configuration.loadError")}
      />
    );
  }

  if (!editor.draft) {
    return <DashboardErrorBanner message={t("universalOperations.configuration.loadError")} />;
  }

  const versionSummaries = editor.versions.map((version) => ({
    version: version.version,
    changeSummary: version.changeSummary,
    publishedAt: version.createdAt,
  }));

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h2 className="text-xl font-bold">{t("universalOperations.configuration.title")}</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t("universalOperations.configuration.subtitle")}</p>
        <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">{t("universalOperations.configuration.audienceHint")}</p>
        {readOnly ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">{t("universalOperations.configuration.readOnlyHint")}</p>
        ) : null}
      </header>

      <OperationsConfigWorkflowGuide hasUnsavedDraft={editor.hasUnpublishedDraft || editor.isDirty} isPublished={isLive} />

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
        canWrite={editor.canWrite}
        canPublish={editor.canPublish}
        publishSummary={publishSummary}
        onPublishSummaryChange={setPublishSummary}
        onSaveDraft={() => void handleSaveDraft()}
        onValidate={() => void handleValidate()}
        onPublish={() => void handlePublish()}
      />

      <OperationsConfigValidationReportPanel report={editor.validationReport} />

      <OperationsConfigNav activeTab={activeTab} onTabChange={setActiveTab} />

      <OperationsConfigTabIntro tab={activeTab} />

      <OperationsConfigTabContent
        tab={activeTab}
        draft={editor.draft}
        updateDraft={editor.updateDraft}
        readOnly={readOnly}
        versions={versionSummaries}
        onRollback={(version) => setRollbackVersion(version)}
        onCompareVersion={handleCompareVersion}
        canPublish={editor.canPublish}
      />

      <OperationsConfigEnterpriseToolbar
        editor={editor}
        activeTab={activeTab}
        readOnly={readOnly}
        canPublish={editor.canPublish}
        onOpenDiff={() => {
          editor.compareWithPublished();
          setDiffOpen(true);
        }}
      />

      <OperationsConfigDiffDialog open={diffOpen} onOpenChange={setDiffOpen} diff={editor.compareDiff} />

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
              disabled={!editor.canPublish}
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
