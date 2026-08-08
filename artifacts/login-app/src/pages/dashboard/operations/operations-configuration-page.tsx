import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import { OperationsConfigEnterpriseToolbar } from "@/components/universal-operations/configuration/operations-config-enterprise-toolbar";
import { OperationsConfigDiffDialog } from "@/components/universal-operations/configuration/operations-config-diff-dialog";
import { OperationsConfigTaskHub } from "@/components/universal-operations/configuration/operations-config-task-hub";
import { OperationsConfigScreenContent } from "@/components/universal-operations/configuration/operations-config-screen-content";
import type { OperationsConfigScreen } from "@/components/universal-operations/configuration/operations-config-screens";
import type { OperationsConfigTab } from "@workspace/universal-operations-engine";

export function OperationsConfigurationPage() {
  const { t } = useTranslation("common");
  const [screen, setScreen] = useState<OperationsConfigScreen>("home");
  const [publishSummary, setPublishSummary] = useState("");
  const [rollbackVersion, setRollbackVersion] = useState<number | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const editor = useOperationsConfigurationEditor();
  const readOnly = !editor.canWrite;

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

  const legacyTab = (screen === "home" ? "general" : screen) as OperationsConfigTab;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-xl font-bold">{t("universalOperations.configuration.title")}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{t("universalOperations.configuration.tasks.homeSubtitle")}</p>
        {readOnly ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">{t("universalOperations.configuration.readOnlyHint")}</p>
        ) : null}
      </header>

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

      {screen === "home" ? (
        <OperationsConfigTaskHub draft={editor.draft} onSelectTask={setScreen} />
      ) : (
        <OperationsConfigScreenContent
          screen={screen}
          onBack={() => setScreen("home")}
          draft={editor.draft}
          updateDraft={editor.updateDraft}
          readOnly={readOnly}
          versions={versionSummaries}
          onRollback={(version) => setRollbackVersion(version)}
          onCompareVersion={handleCompareVersion}
          canPublish={editor.canPublish}
        />
      )}

      <OperationsConfigEnterpriseToolbar
        editor={editor}
        activeTab={legacyTab}
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
