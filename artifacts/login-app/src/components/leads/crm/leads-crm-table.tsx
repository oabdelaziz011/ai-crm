import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BriefcaseBusiness,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  StickyNote,
  Trash2,
  UserCheck,
  UserPlus,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LeadWorkspaceRow } from "@workspace/universal-operations-engine";
import { translateLeadStageLabel } from "@/components/leads/kanban/lead-stage-label";
import { EmployeeIdentityCard } from "@/components/employee-identity/employee-identity-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { LeadsAvatar } from "@/components/leads/workspace/leads-avatar";
import { LeadsStageBadge } from "@/components/leads/workspace/leads-stage-badge";
import { formatBillingCurrency } from "@/lib/billing/format";
import type { EmployeeIdentity } from "@/lib/employee-identity/types";
import { cn } from "@/lib/utils";
import {
  groupLeadTableActions,
  resolveLeadTableActions,
  type LeadTableActionId,
  type LeadTableActionPermissions,
} from "./leads-crm-row-actions";

const COL_COUNT = 13;

export type LeadContactSortColumn = "customerName" | "email" | "mobile";
export type LeadContactSortState = {
  column: LeadContactSortColumn;
  direction: "asc" | "desc";
} | null;

export type LeadContactColumnFilters = {
  customerName: string;
  email: string;
  mobile: string;
};

const ACTION_ICONS: Record<LeadTableActionId, LucideIcon> = {
  openLead360: UserRound,
  edit: Pencil,
  createActivity: StickyNote,
  createOpportunity: BriefcaseBusiness,
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  assign: UserPlus,
  convert: UserCheck,
  archive: Archive,
  delete: Trash2,
};

function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }).format(
    date,
  );
}

function priorityLabel(t: (key: string) => string, priority: LeadWorkspaceRow["priority"]): string {
  return t(`leads.workspace.priority.${priority}`);
}

function TableEmptyBody({
  onCreate,
  canCreate,
}: {
  onCreate: () => void;
  canCreate: boolean;
}) {
  const { t } = useTranslation("common");

  return (
    <tr>
      <td colSpan={COL_COUNT} className="p-0">
        <div className="flex min-h-[360px] flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-5 flex size-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 7.5h16M4 12h10M4 16.5h7"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <p className="text-[15px] font-semibold tracking-tight text-foreground">
            {t("leads.workspace.emptyTitle")}
          </p>
          <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-muted-foreground">
            {t("leads.workspace.emptySubtitle")}
          </p>
          {canCreate ? (
            <Button
              type="button"
              size="sm"
              className="mt-5 h-9 gap-1.5 rounded-lg px-3.5 text-[13px] font-semibold"
              onClick={onCreate}
            >
              <Plus className="size-3.5" strokeWidth={2.5} />
              {t("leads.workspace.newLead")}
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function SortableContactHeader({
  label,
  column,
  sort,
  onSortChange,
  filter,
  onFilterChange,
  filterPlaceholder,
}: {
  label: string;
  column: LeadContactSortColumn;
  sort: LeadContactSortState;
  onSortChange: (next: LeadContactSortState) => void;
  filter: string;
  onFilterChange: (value: string) => void;
  filterPlaceholder: string;
}) {
  const active = sort?.column === column;
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <th className="border-b border-border/60 px-3.5 py-2.5 text-start align-bottom">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground hover:text-foreground"
        onClick={() => {
          if (!active) {
            onSortChange({ column, direction: "asc" });
            return;
          }
          if (sort.direction === "asc") {
            onSortChange({ column, direction: "desc" });
            return;
          }
          onSortChange(null);
        }}
      >
        {label}
        <Icon className="size-3 opacity-70" aria-hidden />
      </button>
      <Input
        value={filter}
        onChange={(event) => onFilterChange(event.target.value)}
        placeholder={filterPlaceholder}
        className="mt-1.5 h-7 rounded-md border-border/60 bg-background px-2 text-[11px] shadow-none"
        onClick={(event) => event.stopPropagation()}
      />
    </th>
  );
}

function LeadRowActionsMenu({
  row,
  permissions,
  onAction,
}: {
  row: LeadWorkspaceRow;
  permissions: LeadTableActionPermissions;
  onAction: (action: LeadTableActionId, row: LeadWorkspaceRow) => void;
}) {
  const { t } = useTranslation("common");
  const actions = resolveLeadTableActions({
    permissions,
    hasPhone: Boolean(row.phone?.trim()),
    hasEmail: Boolean(row.email?.trim()),
  });
  const sections = groupLeadTableActions(actions);

  if (sections.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label={t("leads.table.rowActions.menuAriaLabel")}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        collisionPadding={16}
        avoidCollisions
        className="w-[240px] min-w-[220px] max-w-[260px] rounded-xl border-border/70 p-1.5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        {sections.map((section, index) => (
          <div key={section.group}>
            {index > 0 ? <DropdownMenuSeparator className="my-1.5" /> : null}
            <DropdownMenuLabel className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t(section.labelKey)}
            </DropdownMenuLabel>
            {section.actions.map((action) => {
              const Icon = ACTION_ICONS[action.id];
              return (
                <DropdownMenuItem
                  key={action.id}
                  disabled={action.disabled}
                  className={cn(
                    "gap-2 rounded-md px-2 py-1.5 focus:bg-accent",
                    action.destructive && "text-destructive focus:bg-destructive/10 focus:text-destructive",
                  )}
                  onSelect={() => onAction(action.id, row)}
                >
                  <Icon className="size-3.5 shrink-0 opacity-80" aria-hidden />
                  <span className="truncate">{t(action.labelKey)}</span>
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Full-width enterprise table — every cell binds to the canonical Lead workspace row. */
export function LeadsCrmTable({
  rows,
  selectedLeadId,
  ownersByUserId,
  permissions,
  contactSort,
  onContactSortChange,
  contactFilters,
  onContactFiltersChange,
  onSelect,
  onCreate,
  canCreate,
  onCompanyOpen,
  onOwnerOpen,
  onRowAction,
}: {
  rows: LeadWorkspaceRow[];
  selectedLeadId: string | null;
  ownersByUserId: ReadonlyMap<string, EmployeeIdentity>;
  permissions: LeadTableActionPermissions;
  contactSort: LeadContactSortState;
  onContactSortChange: (next: LeadContactSortState) => void;
  contactFilters: LeadContactColumnFilters;
  onContactFiltersChange: (next: LeadContactColumnFilters) => void;
  onSelect: (row: LeadWorkspaceRow) => void;
  onCreate: () => void;
  canCreate: boolean;
  onCompanyOpen: (row: LeadWorkspaceRow) => void;
  onOwnerOpen: (ownerUserId: string) => void;
  onRowAction: (action: LeadTableActionId, row: LeadWorkspaceRow) => void;
}) {
  const { t, i18n } = useTranslation("common");

  // Actions is last in DOM order → far left in RTL (enterprise CRM convention).
  const trailingColumns = [
    t("leads.columns.company"),
    t("leads.columns.owner"),
    t("leads.columns.stage"),
    t("leads.columns.priority"),
    t("leads.workspace.fields.temperature"),
    t("leads.columns.value"),
    t("leads.columns.source"),
    t("leads.workspace.fields.expectedCloseDate"),
    t("leads.columns.lastActivity"),
    t("leads.columns.actions"),
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-background">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1480px] border-separate border-spacing-0 text-[13px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted/40">
              <SortableContactHeader
                label={t("leads.columns.customerName")}
                column="customerName"
                sort={contactSort}
                onSortChange={onContactSortChange}
                filter={contactFilters.customerName}
                onFilterChange={(value) =>
                  onContactFiltersChange({ ...contactFilters, customerName: value })
                }
                filterPlaceholder={t("leads.table.columnSearch.customerName")}
              />
              <SortableContactHeader
                label={t("leads.columns.email")}
                column="email"
                sort={contactSort}
                onSortChange={onContactSortChange}
                filter={contactFilters.email}
                onFilterChange={(value) =>
                  onContactFiltersChange({ ...contactFilters, email: value })
                }
                filterPlaceholder={t("leads.table.columnSearch.email")}
              />
              <SortableContactHeader
                label={t("leads.columns.mobile")}
                column="mobile"
                sort={contactSort}
                onSortChange={onContactSortChange}
                filter={contactFilters.mobile}
                onFilterChange={(value) =>
                  onContactFiltersChange({ ...contactFilters, mobile: value })
                }
                filterPlaceholder={t("leads.table.columnSearch.mobile")}
              />
              {trailingColumns.map((label, index) => (
                <th
                  key={`${label}-${index}`}
                  className={cn(
                    "border-b border-border/60 px-3.5 py-2.5 text-start text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
                    index === trailingColumns.length - 1 && "pe-4 whitespace-nowrap",
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <TableEmptyBody onCreate={onCreate} canCreate={canCreate} />
            ) : (
              rows.map((row) => {
                const active = row.id === selectedLeadId;
                const ownerIdentity = row.ownerId ? ownersByUserId.get(row.ownerId) : undefined;
                const stageLabel = translateLeadStageLabel(t, {
                  name: row.stage,
                  lifecycleStatus: row.lifecycleStatus,
                  slug: row.stage,
                });

                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "transition-colors",
                      active ? "bg-primary/[0.06]" : "hover:bg-muted/40",
                    )}
                  >
                    <td className="border-b border-border/40 px-3.5 py-3 ps-4">
                      <button
                        type="button"
                        onClick={() => onSelect(row)}
                        className="flex min-w-[160px] items-center gap-2.5 rounded-sm text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={t("leads.table.rowActions.openLead360Named", {
                          name: row.name,
                        })}
                      >
                        <LeadsAvatar name={row.name} size="sm" />
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium text-foreground underline-offset-2 hover:underline">
                            {row.name}
                          </div>
                          {row.tags.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {row.tags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </button>
                    </td>

                    <td className="border-b border-border/40 px-3.5 py-3 text-muted-foreground">
                      <span className="block min-w-[140px] truncate">{row.email || "—"}</span>
                    </td>

                    <td className="border-b border-border/40 px-3.5 py-3 text-muted-foreground">
                      <span className="block min-w-[120px] truncate tabular-nums">
                        {row.phone || "—"}
                      </span>
                    </td>

                    <td className="border-b border-border/40 px-3.5 py-3">
                      {row.companyName?.trim() ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onCompanyOpen(row);
                          }}
                          className="max-w-[180px] truncate text-start font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={t("leads.table.openCompany360", {
                            name: row.companyName,
                          })}
                        >
                          {row.companyName}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="border-b border-border/40 px-3.5 py-3">
                      {row.ownerId ? (
                        <EmployeeIdentityCard
                          userId={row.ownerId}
                          identity={ownerIdentity ?? null}
                          fallbackName={row.owner}
                          showEmail={false}
                          showJobTitle
                          size="sm"
                          className="min-w-[160px] items-center"
                          onNameClick={() => onOwnerOpen(row.ownerId!)}
                          nameAriaLabel={t("leads.table.openOwnerWorkspace", {
                            name: row.owner || ownerIdentity?.fullName || "",
                          })}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="border-b border-border/40 px-3.5 py-3">
                      <LeadsStageBadge
                        label={stageLabel}
                        lifecycleStatus={row.lifecycleStatus}
                      />
                    </td>
                    <td className="border-b border-border/40 px-3.5 py-3 text-muted-foreground capitalize">
                      {priorityLabel(t, row.priority)}
                    </td>
                    <td className="border-b border-border/40 px-3.5 py-3 text-muted-foreground capitalize">
                      {row.temperature ? t(`leads.scoreBand.${row.temperature}`) : "—"}
                    </td>
                    <td className="border-b border-border/40 px-3.5 py-3 font-medium tabular-nums text-foreground">
                      {formatBillingCurrency(row.expectedValue)}
                    </td>
                    <td className="border-b border-border/40 px-3.5 py-3 text-muted-foreground">
                      {row.source || "—"}
                    </td>
                    <td className="border-b border-border/40 px-3.5 py-3 text-muted-foreground">
                      {formatDate(row.expectedCloseDate, i18n.language)}
                    </td>
                    <td className="border-b border-border/40 px-3.5 py-3 text-muted-foreground">
                      {formatDate(row.lastActivityAt, i18n.language)}
                    </td>

                    <td
                      className="border-b border-border/40 px-2 py-3 pe-4 whitespace-nowrap"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <LeadRowActionsMenu
                        row={row}
                        permissions={permissions}
                        onAction={onRowAction}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
