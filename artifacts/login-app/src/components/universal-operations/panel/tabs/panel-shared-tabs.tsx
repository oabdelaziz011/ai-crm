import type { OperationsCustomerWorkspaceData } from "@workspace/universal-operations-engine";
import { WorkspaceListRow } from "@/components/customer-workspace/workspace-ui";

export function PanelTimelineTab({ data }: { data: OperationsCustomerWorkspaceData }) {
  return (
    <div className="space-y-2">
      {data.timeline.map((entry) => (
        <WorkspaceListRow
          key={entry.id}
          title={entry.title}
          subtitle={`${entry.summary} · ${new Date(entry.occurredAt).toLocaleString()}`}
          badge={entry.type}
        />
      ))}
    </div>
  );
}

export function PanelBookingsTab({ data }: { data: OperationsCustomerWorkspaceData }) {
  return (
    <div className="space-y-2">
      {data.bookings.map((b) => (
        <WorkspaceListRow
          key={b.id}
          title={b.service}
          subtitle={`${b.resource} · ${new Date(b.scheduledAt).toLocaleString()}`}
          badge={b.status}
        />
      ))}
    </div>
  );
}

export function PanelInvoicesTab({ data }: { data: OperationsCustomerWorkspaceData }) {
  return (
    <div className="space-y-2">
      {data.invoices.map((inv) => (
        <WorkspaceListRow
          key={inv.id}
          title={inv.number}
          subtitle={`$${(inv.amountCents / 100).toFixed(2)} · ${new Date(inv.issuedAt).toLocaleDateString()}`}
          badge={inv.status}
        />
      ))}
    </div>
  );
}

export function PanelPaymentsTab({ data }: { data: OperationsCustomerWorkspaceData }) {
  return (
    <div className="space-y-2">
      <p className="mb-3 text-sm text-muted-foreground">
        Outstanding: ${(data.outstandingBalanceCents / 100).toFixed(2)}
      </p>
      {data.payments.map((p) => (
        <WorkspaceListRow
          key={p.id}
          title={p.method}
          subtitle={`$${(p.amountCents / 100).toFixed(2)} · ${new Date(p.paidAt).toLocaleString()}`}
        />
      ))}
    </div>
  );
}

export function PanelActivitiesTab({ data }: { data: OperationsCustomerWorkspaceData }) {
  return (
    <div className="space-y-2">
      {data.activities.map((a) => (
        <WorkspaceListRow
          key={a.id}
          title={a.subject}
          subtitle={`${a.channel} · ${new Date(a.occurredAt).toLocaleString()}`}
        />
      ))}
    </div>
  );
}

export function PanelFilesTab({ data }: { data: OperationsCustomerWorkspaceData }) {
  return (
    <div className="space-y-2">
      {data.files.map((f) => (
        <WorkspaceListRow key={f.id} title={f.name} subtitle={`${f.type.toUpperCase()} · ${f.sizeKb} KB`} />
      ))}
    </div>
  );
}

export function PanelNotesTab({ data }: { data: OperationsCustomerWorkspaceData }) {
  return (
    <div className="space-y-2">
      {data.notes.map((n) => (
        <div key={n.id} className="rounded-lg border border-border/50 bg-background/25 p-3">
          <p className="text-sm">{n.body}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">{n.author} · {new Date(n.createdAt).toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
}

export function PanelTasksTab({ data }: { data: OperationsCustomerWorkspaceData }) {
  return (
    <div className="space-y-2">
      {data.tasks.map((task) => (
        <WorkspaceListRow
          key={task.id}
          title={task.title}
          subtitle={`${task.assignee} · ${new Date(task.dueAt).toLocaleDateString()}`}
          badge={task.status}
        />
      ))}
    </div>
  );
}

export function PanelAiTab({ data }: { data: OperationsCustomerWorkspaceData }) {
  return (
    <div className="space-y-3">
      {data.aiInsights.map((insight) => (
        <div key={insight.id} className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{insight.title}</p>
            <span className="text-[10px] font-mono text-muted-foreground">{Math.round(insight.confidence * 100)}%</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{insight.body}</p>
        </div>
      ))}
    </div>
  );
}
