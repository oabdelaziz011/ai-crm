import { memo } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Eye, ListRestart, MoreHorizontal, Pencil, Radio, Rocket, RotateCcw, Shield, Ban, Trash2 } from "lucide-react";
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
import {
  agentContinueHref,
  agentEditHref,
  agentLifecycleHref,
  agentManageChannelsHref,
  agentManageCapabilitiesHref,
  agentViewDetailsHref,
} from "@/config/agents-route-registry";
import {
  visibleAiEmployeeRowActions,
  type AiEmployeeRowActionCapabilities,
  type AiEmployeeRowActionId,
} from "@/lib/ai-employees/utilities/ai-employee-row-actions";
import {
  formatEmployeeDepartmentLabel,
  formatEmployeeProviderLabel,
} from "@/lib/ai-employees/utilities/format-employee-field-label";
import { formatEmployeeTagLabel } from "@/lib/ai-employees/utilities/format-employee-tag-label";
import { nestedSectionHref } from "@/lib/routing";
import { cn } from "@/lib/utils";

type AiEmployeeTableProps = {
  employees: AiEmployeeRecord[];
  capabilities: AiEmployeeRowActionCapabilities;
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

function actionIcon(id: AiEmployeeRowActionId) {
  switch (id) {
    case "view":
      return Eye;
    case "continue":
      return ListRestart;
    case "edit":
      return Pencil;
    case "manageChannels":
      return Radio;
    case "manageCapabilities":
      return Shield;
    case "publish":
      return Rocket;
    case "disable":
      return Ban;
    case "restore":
      return RotateCcw;
    case "delete":
      return Trash2;
    default:
      return Eye;
  }
}

function navigateForAction(
  id: AiEmployeeRowActionId,
  employee: AiEmployeeRecord,
  setLocation: (href: string) => void,
  onDelete: (employee: AiEmployeeRecord) => void,
) {
  switch (id) {
    case "view":
      setLocation(nestedSectionHref(agentViewDetailsHref(employee.id)));
      break;
    case "continue":
      setLocation(agentContinueHref(employee.id));
      break;
    case "edit":
      setLocation(nestedSectionHref(agentEditHref(employee.id)));
      break;
    case "manageChannels":
      setLocation(nestedSectionHref(agentManageChannelsHref(employee.id)));
      break;
    case "manageCapabilities":
      setLocation(nestedSectionHref(agentManageCapabilitiesHref(employee.id)));
      break;
    case "publish":
    case "disable":
    case "restore":
      setLocation(nestedSectionHref(agentLifecycleHref(employee.id)));
      break;
    case "delete":
      onDelete(employee);
      break;
    default:
      break;
  }
}

const AiEmployeeRow = memo(function AiEmployeeRow({
  employee,
  capabilities,
  onDelete,
}: {
  employee: AiEmployeeRecord;
  capabilities: AiEmployeeRowActionCapabilities;
  onDelete: (employee: AiEmployeeRecord) => void;
}) {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const actions = visibleAiEmployeeRowActions(employee, capabilities);

  return (
    <div className="grid grid-cols-[minmax(0,2fr)_repeat(7,minmax(0,1fr))_auto] items-center gap-3 border-b border-border/40 px-4 py-3 last:border-b-0 hover:bg-primary/[0.03]">
      <button
        type="button"
        className="flex min-w-0 items-center gap-3 text-start"
        onClick={() => setLocation(nestedSectionHref(agentViewDetailsHref(employee.id)))}
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
            {actions.map((action) => {
              const Icon = actionIcon(action.id);
              return (
                <DropdownMenuItem
                  key={action.id}
                  className={
                    action.destructive ? "text-destructive focus:text-destructive" : undefined
                  }
                  onSelect={() => navigateForAction(action.id, employee, setLocation, onDelete)}
                >
                  <Icon className="me-2 size-4" />
                  {t(`aiEmployees.actions.${action.id}`)}
                </DropdownMenuItem>
              );
            })}
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
  capabilities,
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
            capabilities={capabilities}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
});
