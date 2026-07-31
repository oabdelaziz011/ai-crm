import { useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import type { AiEmployeeRecord, AiEmployeeVersionRecord } from "@/lib/ai-employees/types";
import { VersionCompareView } from "./version-compare-view";
import { useCompareAiEmployeeVersions } from "@/lib/ai-employees/hooks";

type VersionHistoryPanelProps = {
  companyId: string | null;
  agentId: string | null;
  employee: AiEmployeeRecord;
  versions: AiEmployeeVersionRecord[];
  canRollback: boolean;
  isRollingBack: boolean;
  onRollback: (versionNumber: number) => Promise<void>;
};

export function VersionHistoryPanel({
  companyId,
  agentId,
  employee,
  versions,
  canRollback,
  isRollingBack,
  onRollback,
}: VersionHistoryPanelProps) {
  const { t } = useTranslation("common");
  const [compareLeft, setCompareLeft] = useState<number | null>(versions[1]?.versionNumber ?? null);
  const [compareRight, setCompareRight] = useState<number | null>(versions[0]?.versionNumber ?? null);
  const compareQuery = useCompareAiEmployeeVersions(companyId, agentId, compareLeft, compareRight);

  return (
    <DashboardCard className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <History className="size-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("aiEmployees.lifecycle.versions.title")}
        </h2>
      </div>

      {versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("aiEmployees.lifecycle.versions.empty")}</p>
      ) : (
        <div className="space-y-3">
          {versions.map((version) => {
            const isCurrent = employee.publishedVersionId === version.id;
            return (
              <div key={version.id} className="rounded-2xl border border-border/60 bg-background/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {t("aiEmployees.lifecycle.versions.version", { number: version.versionNumber })}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{t(`aiEmployees.lifecycle.versionStatus.${version.status}`)}</Badge>
                    {isCurrent ? (
                      <Badge>{t("aiEmployees.lifecycle.versions.current")}</Badge>
                    ) : null}
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {version.publishNotes || t("aiEmployees.lifecycle.versions.noNotes")}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(version.publishedAt).toLocaleString()}
                </p>
                {canRollback && !isCurrent ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 rounded-xl"
                    disabled={isRollingBack}
                    onClick={() => void onRollback(version.versionNumber)}
                  >
                    <RotateCcw className="me-2 size-4" />
                    {t("aiEmployees.lifecycle.actions.rollback")}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {versions.length >= 2 ? (
        <div className="space-y-3 border-t border-border/60 pt-4">
          <p className="text-sm font-semibold">{t("aiEmployees.lifecycle.compare.title")}</p>
          <div className="grid gap-2 md:grid-cols-2">
            <select
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={compareLeft ?? ""}
              onChange={(event) => setCompareLeft(Number(event.target.value))}
            >
              {versions.map((version) => (
                <option key={`left-${version.id}`} value={version.versionNumber}>
                  v{version.versionNumber}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={compareRight ?? ""}
              onChange={(event) => setCompareRight(Number(event.target.value))}
            >
              {versions.map((version) => (
                <option key={`right-${version.id}`} value={version.versionNumber}>
                  v{version.versionNumber}
                </option>
              ))}
            </select>
          </div>
          {compareQuery.data ? <VersionCompareView comparison={compareQuery.data} /> : null}
        </div>
      ) : null}
    </DashboardCard>
  );
}
