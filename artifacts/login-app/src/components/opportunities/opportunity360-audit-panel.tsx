import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { OpportunityHistoryReadModel, OpportunityStageReadModel } from "@workspace/application-layer";
import { Briefcase } from "lucide-react";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { useEmployeeIdentity } from "@/hooks/employee-identity/use-employee-identity";
import {
  formatOpportunityAuditAction,
  formatOpportunityAuditValue,
  opportunityHistoryHasFieldDiff,
  translateOpportunityAuditFieldName,
  type OpportunityAuditFormatContext,
} from "./opportunity360-audit-utils";
import { emptyDisplayValue, formatOpportunityDateTime } from "./opportunity360-ui";

function AuditActorCell({ userId }: { userId: string | null }) {
  const { t } = useTranslation("common");
  const empty = emptyDisplayValue(t);
  const { data: identity } = useEmployeeIdentity(userId);

  if (!userId?.trim()) return <span className="text-muted-foreground">{empty}</span>;
  const name = identity?.fullName?.trim();
  if (name) return <span className="font-medium">{name}</span>;
  return <span className="text-muted-foreground">{empty}</span>;
}

function AuditValueCell({
  fieldName,
  rawValue,
  ctx,
}: {
  fieldName: string | null | undefined;
  rawValue: string | null | undefined;
  ctx: OpportunityAuditFormatContext;
}) {
  const { t } = useTranslation("common");
  const empty = emptyDisplayValue(t);
  const field = fieldName?.trim().toLowerCase() ?? "";
  const isOwnerField = field === "owner_user_id" || field === "owner_id";
  const userId = isOwnerField && rawValue?.trim() ? rawValue.trim() : null;
  const { data: identity } = useEmployeeIdentity(userId);

  const formatted = formatOpportunityAuditValue(fieldName, rawValue, {
    ...ctx,
    resolveUserName: (id) => {
      if (userId && id === userId) return identity?.fullName?.trim() ?? null;
      return ctx.resolveUserName?.(id) ?? null;
    },
  });

  if (!formatted) {
    return <span className="text-muted-foreground">{empty}</span>;
  }

  return <span>{formatted}</span>;
}

export function Opportunity360AuditPanel({
  history,
  locale,
  stageById,
  opportunityCurrency,
}: {
  history: readonly OpportunityHistoryReadModel[];
  locale: string;
  stageById: ReadonlyMap<string, OpportunityStageReadModel>;
  opportunityCurrency?: string | null;
}) {
  const { t } = useTranslation("common");
  const empty = emptyDisplayValue(t);

  const auditCtx: OpportunityAuditFormatContext = useMemo(
    () => ({
      t,
      stageById,
      opportunityCurrency,
    }),
    [t, stageById, opportunityCurrency],
  );

  if (!history.length) {
    return (
      <EnterpriseEmptyState
        icon={<Briefcase className="size-6" aria-hidden />}
        title={t("opportunities360.audit.emptyTitle")}
        description={t("opportunities360.audit.emptyBody")}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full min-w-[720px] text-start text-[13px]">
        <thead className="border-b border-border/60 bg-muted/30 text-[11px] uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-semibold">{t("opportunities360.audit.columns.actor")}</th>
            <th className="px-3 py-2 font-semibold">{t("opportunities360.audit.columns.action")}</th>
            <th className="px-3 py-2 font-semibold">{t("opportunities360.audit.columns.timestamp")}</th>
            <th className="px-3 py-2 font-semibold">{t("opportunities360.audit.columns.field")}</th>
            <th className="px-3 py-2 font-semibold">{t("opportunities360.audit.columns.oldValue")}</th>
            <th className="px-3 py-2 font-semibold">{t("opportunities360.audit.columns.newValue")}</th>
          </tr>
        </thead>
        <tbody>
          {history.map((item) => {
            const hasDiff = opportunityHistoryHasFieldDiff(item);
            const fieldLabel = translateOpportunityAuditFieldName(item.fieldName, t);
            return (
              <tr key={item.id} className="border-b border-border/40 align-top">
                <td className="px-3 py-2.5">
                  <AuditActorCell userId={item.actorUserId} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="font-medium">{formatOpportunityAuditAction(item, t)}</div>
                  {item.summary?.trim() ? (
                    <div className="mt-1 whitespace-pre-line text-[12px] text-muted-foreground">
                      {item.summary}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                  {formatOpportunityDateTime(item.createdAt, locale) || empty}
                </td>
                <td className="px-3 py-2.5">{fieldLabel || (hasDiff ? empty : "—")}</td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {hasDiff ? (
                    <AuditValueCell fieldName={item.fieldName} rawValue={item.previousValue} ctx={auditCtx} />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {hasDiff ? (
                    <AuditValueCell fieldName={item.fieldName} rawValue={item.newValue} ctx={auditCtx} />
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
