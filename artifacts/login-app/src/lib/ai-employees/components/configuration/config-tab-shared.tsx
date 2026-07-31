import type { AgentRuntimeConfiguration } from "@/lib/ai-employees/adapters";
import type { AiEmployeeConfigurationUpdate, AiEmployeeRecord } from "@/lib/ai-employees/types";

export type AgentConfigTabProps = {
  employee: AiEmployeeRecord;
  preview: AgentRuntimeConfiguration | null;
  canEdit: boolean;
  isSaving: boolean;
  onSave: (patch: AiEmployeeConfigurationUpdate) => void;
};

export function ConfigSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

export function ReadonlyGrid({
  rows,
}: {
  rows: Array<{ label: string; value: string | number | boolean | null | undefined }>;
}) {
  return (
    <div className="divide-y divide-border/50 rounded-xl border border-border/60">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
          <span className="text-muted-foreground">{row.label}</span>
          <span className="font-medium">{formatValue(row.value)}</span>
        </div>
      ))}
    </div>
  );
}

function formatValue(value: string | number | boolean | null | undefined): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function ValidationList({ preview }: { preview: AgentRuntimeConfiguration | null }) {
  if (!preview || preview.validationIssues.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-4">
      {preview.validationIssues.map((issue) => (
        <div key={`${issue.field}-${issue.code}`} className="text-sm">
          <span className={issue.severity === "error" ? "text-destructive" : "text-amber-600"}>
            {issue.message}
          </span>
        </div>
      ))}
    </div>
  );
}
