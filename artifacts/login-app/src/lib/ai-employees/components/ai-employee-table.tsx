import { memo } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Eye, ListRestart, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AiEmployeeStatusBadge } from "@/lib/ai-employees/components/ai-employee-status-badge";
import type { AiEmployeeRecord } from "@/lib/ai-employees/types";
import { agentContinueHref, agentDetailHref, agentEditHref } from "@/config/agents-route-registry";
import {
  formatEmployeeDepartmentLabel,
  formatEmployeeProviderLabel,
} from "@/lib/ai-employees/utilities/format-employee-field-label";
import { formatEmployeeTagLabel } from "@/lib/ai-employees/utilities/format-employee-tag-label";
import { nestedSectionHref } from "@/lib/routing";
import { cn } from "@/lib/utils";

type AiEmployeeTableProps = {
  employees: AiEmployeeRecord[];
  canEdit: boolean;
  canDelete: boolean;
  onDelete: (employee: AiEmployeeRecord) => void;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function channelTagsLabel(t: TFunction<"common">, tags: string[] | undefined): string {
  const channelTags = (tags ?? []).filter(
    (tag) => tag.startsWith("channel:") || tag === "capability:omnichannel",
  );
  if (channelTags.length === 0) return "—";
  return channelTags
    .slice(0, 2)
    .map((tag) => formatEmployeeTagLabel(t, tag))
    .join(" · ");
}

const AiEmployeeRow = memo(function AiEmployeeRow({
  employee,
  canEdit,
  canDelete,
  onDelete,
}: {
  employee: AiEmployeeRecord;
  canEdit: boolean;
  canDelete: boolean;
  onDelete: (employee: AiEmployeeRecord) => void;
}) {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();

  return (
    <div className="grid grid-cols-[minmax(0,2fr)_repeat(7,minmax(0,1fr))_auto] items-center gap-3 border-b border-border/40 px-4 py-3 last:border-b-0 hover:bg-primary/[0.03]">
      <button
        type="button"
        className="flex min-w-0 items-center gap-3 text-start"
        onClick={() => setLocation(nestedSectionHref(agentDetailHref(employee.id)))}
      >
        <Avatar className="size-9 shrink-0">
          {employee.avatar ? <AvatarImage src={employee.avatar} alt={employee.displayName} /> : null}
          <AvatarFallback>{initials(employee.displayName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-medium">{employee.displayName}</p>
          <p className="truncate text-xs text-muted-foreground">{employee.name}</p>
        </div>
      </button>

      <div>
        <AiEmployeeStatusBadge status={employee.status} />
      </div>
      <CellText value={formatEmployeeDepartmentLabel(t, employee.department)} />
      <CellText value={formatEmployeeProviderLabel(t, employee.provider)} />
      <CellText value={employee.model} />
      <div
        className="min-w-0 truncate text-xs text-muted-foreground"
        title={(employee.tags ?? []).join(", ")}
      >
        {channelTagsLabel(t, employee.tags)}
      </div>
      <CellText value={employee.owner} />
      <CellText value={new Date(employee.updatedAt).toLocaleDateString()} muted />

      <div className="flex items-center justify-end gap-1">
        {canEdit && employee.status === "draft" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 rounded-lg px-2 text-xs"
            onClick={() => setLocation(agentContinueHref(employee.id))}
          >
            <ListRestart className="me-1 size-3.5" />
            {t("aiEmployees.actions.continue")}
          </Button>
        ) : null}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 rounded-lg"
              aria-label={t("aiEmployees.table.actions")}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[80] rounded-xl" sideOffset={6}>
            <DropdownMenuItem
              onSelect={() => setLocation(nestedSectionHref(agentDetailHref(employee.id)))}
            >
              <Eye className="me-2 size-4" />
              {t("aiEmployees.actions.view")}
            </DropdownMenuItem>
            {canEdit && employee.status === "draft" ? (
              <DropdownMenuItem onSelect={() => setLocation(agentContinueHref(employee.id))}>
                <ListRestart className="me-2 size-4" />
                {t("aiEmployees.actions.continue")}
              </DropdownMenuItem>
            ) : null}
            {canEdit ? (
              <DropdownMenuItem
                onSelect={() => setLocation(nestedSectionHref(agentEditHref(employee.id)))}
              >
                <Pencil className="me-2 size-4" />
                {t("aiEmployees.actions.edit")}
              </DropdownMenuItem>
            ) : null}
            {canDelete ? (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onDelete(employee)}
              >
                <Trash2 className="me-2 size-4" />
                {t("aiEmployees.actions.delete")}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});

const CellText = memo(function CellText({
  value,
  muted,
}: {
  value: string | null | undefined;
  muted?: boolean;
}) {
  return (
    <p className={cn("truncate text-sm", muted && "text-muted-foreground")}>
      {value?.trim() || "—"}
    </p>
  );
});

export const AiEmployeeTable = memo(function AiEmployeeTable({
  employees,
  canEdit,
  canDelete,
  onDelete,
}: AiEmployeeTableProps) {
  const { t } = useTranslation("common");

  return (
    <div className="overflow-x-auto rounded-xl border border-border/50 bg-transparent">
      <div className="min-w-[960px]">
        <div className="grid grid-cols-[minmax(0,2fr)_repeat(7,minmax(0,1fr))_auto] gap-3 border-b border-border/40 px-4 py-3 text-xs font-semibold text-muted-foreground">
          <span>{t("aiEmployees.table.employee")}</span>
          <span>{t("aiEmployees.table.status")}</span>
          <span>{t("aiEmployees.table.department")}</span>
          <span>{t("aiEmployees.table.provider")}</span>
          <span>{t("aiEmployees.table.model")}</span>
          <span>{t("aiEmployees.table.channels")}</span>
          <span>{t("aiEmployees.table.owner")}</span>
          <span>{t("aiEmployees.table.updated")}</span>
          <span className="sr-only">{t("aiEmployees.table.actions")}</span>
        </div>

        {employees.map((employee) => (
          <AiEmployeeRow
            key={employee.id}
            employee={employee}
            canEdit={canEdit}
            canDelete={canDelete}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
});
