import { useMemo, type ReactNode } from "react";
import { ArrowDown, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AuditOperationBadge } from "@/components/audit-logs/audit-operation-badge";
import {
  buildAuditDetailSummary,
  getChangedFields,
  resolveCompanyName,
} from "@/lib/audit-log/normalize";
import {
  buildLookupContext,
  formatAuditTimestamp,
  getUserDisplay,
  resolveAuditOperation,
  translateRoleName,
} from "@/lib/audit-log/presenter";
import type { EnrichedAuditLog } from "@/lib/types";

type AuditLogDetailsDialogProps = {
  log: EnrichedAuditLog | null;
  open: boolean;
  showAdvanced: boolean;
  onOpenChange: (open: boolean) => void;
};

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-4 py-2.5 border-b border-white/5 last:border-b-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground break-words">{value}</dd>
    </div>
  );
}

function ChangeRow({
  label,
  from,
  to,
}: {
  label: string;
  from: string;
  to: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
        <span className="rounded-lg bg-white/5 px-3 py-2">{from}</span>
        <ArrowDown className="w-4 h-4 text-muted-foreground shrink-0 sm:rotate-[-90deg]" />
        <span className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2">{to}</span>
      </div>
    </div>
  );
}

export function AuditLogDetailsDialog({
  log,
  open,
  showAdvanced,
  onOpenChange,
}: AuditLogDetailsDialogProps) {
  const { t, i18n } = useTranslation("common");

  const context = useMemo(() => (log ? buildLookupContext([log]) : null), [log]);

  const viewModel = useMemo(() => {
    if (!log || !context) return null;

    const operation = resolveAuditOperation(log);
    const user = getUserDisplay(log, t);
    const timestamp = formatAuditTimestamp(log.created_at, i18n.language, t);
    const changes = getChangedFields(log, context, t);
    const summary = buildAuditDetailSummary(log, changes, context, t);
    const companyName = resolveCompanyName(log) ?? t("auditLogs.fallbacks.unavailable");

    return {
      operation,
      user,
      timestamp,
      changes,
      summary,
      companyName,
    };
  }, [log, context, t, i18n.language]);

  if (!log || !viewModel) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card/95 border-white/10">
        <DialogHeader>
          <DialogTitle>{t("auditLogs.details.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <section className="rounded-xl border border-white/10 bg-black/20 p-4">
            <dl>
              <DetailRow
                label={t("auditLogs.details.labels.action")}
                value={<AuditOperationBadge operation={viewModel.operation} />}
              />
              <DetailRow
                label={t("auditLogs.details.labels.performedBy")}
                value={
                  <div>
                    <p className="font-medium">{viewModel.user.name}</p>
                    {viewModel.user.email && (
                      <p className="text-xs text-muted-foreground mt-0.5">{viewModel.user.email}</p>
                    )}
                  </div>
                }
              />
              <DetailRow label={t("auditLogs.details.labels.company")} value={viewModel.companyName} />
              <DetailRow
                label={t("auditLogs.details.labels.role")}
                value={translateRoleName(log.actorRoleName, t)}
              />
              <DetailRow
                label={t("auditLogs.details.labels.time")}
                value={
                  <div dir="ltr" className="space-y-0.5">
                    <p>{viewModel.timestamp.absolute}</p>
                    <p className="text-xs text-muted-foreground">{viewModel.timestamp.time}</p>
                  </div>
                }
              />
            </dl>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-2">{t("auditLogs.details.labels.description")}</h3>
            <p className="text-sm leading-relaxed rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              {viewModel.summary}
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-3">{t("auditLogs.details.labels.changes")}</h3>
            {viewModel.changes.length > 0 ? (
              <div className="space-y-3">
                {viewModel.changes.map((change) => (
                  <ChangeRow
                    key={change.key}
                    label={change.label}
                    from={change.from}
                    to={change.to}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                {t("auditLogs.details.noChanges")}
              </p>
            )}
          </section>

          {showAdvanced && (
            <Collapsible>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium hover:bg-black/30 transition-colors">
                {t("auditLogs.details.advanced.title")}
                <ChevronDown className="w-4 h-4 shrink-0 transition-transform data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 rounded-xl border border-white/10 bg-black/30 p-4 space-y-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {t("auditLogs.details.advanced.auditId")}
                  </p>
                  <p className="text-xs font-mono break-all" dir="ltr">
                    {log.id}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {t("auditLogs.details.advanced.metadata")}
                  </p>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all text-muted-foreground" dir="ltr">
                    {JSON.stringify(log.metadata ?? {}, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {t("auditLogs.details.advanced.technicalInfo")}
                  </p>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all text-muted-foreground" dir="ltr">
                    {JSON.stringify(
                      {
                        entity: log.entity,
                        entity_id: log.entity_id,
                        user_id: log.user_id,
                        company_id: log.company_id,
                        ip_address: log.ip_address,
                        created_at: log.created_at,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
