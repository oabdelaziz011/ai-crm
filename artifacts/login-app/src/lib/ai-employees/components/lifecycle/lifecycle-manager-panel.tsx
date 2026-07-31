import { lazy, memo, Suspense, useState } from "react";
import { Archive, Ban, RotateCcw, UploadCloud } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardPageFallback } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AgentRuntimeConfiguration } from "@/lib/ai-employees/adapters";
import type {
  AiEmployeeChangeEventRecord,
  AiEmployeeDeploymentRecord,
  AiEmployeeReadinessScore,
  AiEmployeeRecord,
  AiEmployeeValidationResult,
  AiEmployeeVersionRecord,
} from "@/lib/ai-employees/types";
import { ReadinessScoreCard } from "./readiness-score-card";
import { PublishDialog } from "./publish-dialog";

const VersionHistoryPanel = lazy(() =>
  import("./version-history-panel").then((module) => ({ default: module.VersionHistoryPanel })),
);
const DeploymentHistoryPanel = lazy(() =>
  import("./deployment-history-panel").then((module) => ({ default: module.DeploymentHistoryPanel })),
);
const ChangeTimelinePanel = lazy(() =>
  import("./change-timeline-panel").then((module) => ({ default: module.ChangeTimelinePanel })),
);

type LifecycleManagerPanelProps = {
  companyId: string | null;
  agentId: string | null;
  employee: AiEmployeeRecord;
  preview: AgentRuntimeConfiguration | null;
  validation: AiEmployeeValidationResult | null;
  readiness: AiEmployeeReadinessScore | null;
  versions: AiEmployeeVersionRecord[];
  deployments: AiEmployeeDeploymentRecord[];
  timeline: AiEmployeeChangeEventRecord[];
  isLoading: boolean;
  canPublish: boolean;
  canRollback: boolean;
  canArchive: boolean;
  canDisable: boolean;
  isPublishing: boolean;
  isRollingBack: boolean;
  isArchiving: boolean;
  isDisabling: boolean;
  onPublish: (publishNotes: string) => Promise<void>;
  onRollback: (versionNumber: number) => Promise<void>;
  onArchive: () => Promise<void>;
  onRestore: () => Promise<void>;
  onDisable: () => Promise<void>;
};

export const LifecycleManagerPanel = memo(function LifecycleManagerPanel({
  companyId,
  agentId,
  employee,
  preview,
  validation,
  readiness,
  versions,
  deployments,
  timeline,
  isLoading,
  canPublish,
  canRollback,
  canArchive,
  canDisable,
  isPublishing,
  isRollingBack,
  isArchiving,
  isDisabling,
  onPublish,
  onRollback,
  onArchive,
  onRestore,
  onDisable,
}: LifecycleManagerPanelProps) {
  const { t } = useTranslation("common");
  const [publishOpen, setPublishOpen] = useState(false);

  return (
    <section className="space-y-4">
      <DashboardCard className="space-y-4 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("aiEmployees.lifecycle.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("aiEmployees.lifecycle.subtitle")}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {t("aiEmployees.lifecycle.currentVersion", { number: employee.currentVersionNumber || "—" })}
              </Badge>
              {employee.hasUnpublishedDraft ? (
                <Badge variant="secondary">{t("aiEmployees.lifecycle.unpublishedDraft")}</Badge>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canPublish && employee.status !== "archived" ? (
              <Button className="rounded-xl" onClick={() => setPublishOpen(true)}>
                <UploadCloud className="me-2 size-4" />
                {t("aiEmployees.lifecycle.actions.publish")}
              </Button>
            ) : null}
            {canDisable && employee.status === "published" ? (
              <Button variant="outline" className="rounded-xl" disabled={isDisabling} onClick={() => void onDisable()}>
                <Ban className="me-2 size-4" />
                {t("aiEmployees.lifecycle.actions.disable")}
              </Button>
            ) : null}
            {canArchive && employee.status !== "archived" ? (
              <Button variant="outline" className="rounded-xl" disabled={isArchiving} onClick={() => void onArchive()}>
                <Archive className="me-2 size-4" />
                {t("aiEmployees.lifecycle.actions.archive")}
              </Button>
            ) : null}
            {employee.status === "archived" ? (
              <Button variant="outline" className="rounded-xl" onClick={() => void onRestore()}>
                <RotateCcw className="me-2 size-4" />
                {t("aiEmployees.lifecycle.actions.restore")}
              </Button>
            ) : null}
          </div>
        </div>
      </DashboardCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReadinessScoreCard readiness={readiness} isLoading={isLoading} />
        <Suspense fallback={<DashboardPageFallback />}>
          <DeploymentHistoryPanel deployments={deployments} />
        </Suspense>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Suspense fallback={<DashboardPageFallback />}>
          <VersionHistoryPanel
            companyId={companyId}
            agentId={agentId}
            employee={employee}
            versions={versions}
            canRollback={canRollback}
            isRollingBack={isRollingBack}
            onRollback={onRollback}
          />
        </Suspense>
        <Suspense fallback={<DashboardPageFallback />}>
          <ChangeTimelinePanel events={timeline} />
        </Suspense>
      </div>

      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        preview={preview}
        validation={validation}
        readiness={readiness}
        isPublishing={isPublishing}
        onPublish={async (publishNotes) => {
          await onPublish(publishNotes);
        }}
      />
    </section>
  );
});
