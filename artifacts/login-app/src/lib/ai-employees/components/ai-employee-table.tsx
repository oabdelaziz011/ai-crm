import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
  AI_EMPLOYEE_LIST_ROW_HEIGHT,
  computeAiEmployeeListWindow,
} from "@/lib/ai-employees/virtualization/ai-employee-list-window";
import { agentDetailHref, agentEditHref } from "@/config/agents-route-registry";
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

const AiEmployeeRow = memo(function AiEmployeeRow({
  employee,
  canEdit,
  canDelete,
  onDelete,
  style,
}: {
  employee: AiEmployeeRecord;
  canEdit: boolean;
  canDelete: boolean;
  onDelete: (employee: AiEmployeeRecord) => void;
  style?: React.CSSProperties;
}) {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();

  return (
    <div
      className="grid grid-cols-[minmax(0,2fr)_repeat(7,minmax(0,1fr))_auto] items-center gap-3 border-b border-border/60 px-4"
      style={{ ...style, height: AI_EMPLOYEE_LIST_ROW_HEIGHT }}
    >
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
      <CellText value={employee.department} />
      <CellText value={employee.provider} />
      <CellText value={employee.model} />
      <CellText value={employee.owner} />
      <CellText value={new Date(employee.createdAt).toLocaleDateString()} muted />
      <CellText value={new Date(employee.updatedAt).toLocaleDateString()} muted />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 shrink-0 rounded-lg">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rounded-xl">
          <DropdownMenuItem onClick={() => setLocation(nestedSectionHref(agentDetailHref(employee.id)))}>
            <Eye className="me-2 size-4" />
            {t("aiEmployees.actions.view")}
          </DropdownMenuItem>
          {canEdit ? (
            <DropdownMenuItem onClick={() => setLocation(nestedSectionHref(agentEditHref(employee.id)))}>
              <Pencil className="me-2 size-4" />
              {t("aiEmployees.actions.edit")}
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(employee)}>
              <Trash2 className="me-2 size-4" />
              {t("aiEmployees.actions.delete")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

const CellText = memo(function CellText({ value, muted }: { value: string | null | undefined; muted?: boolean }) {
  return (
    <p className={cn("truncate text-sm", muted && "text-muted-foreground")}>{value?.trim() || "—"}</p>
  );
});

export const AiEmployeeTable = memo(function AiEmployeeTable({
  employees,
  canEdit,
  canDelete,
  onDelete,
}: AiEmployeeTableProps) {
  const { t } = useTranslation("common");
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);

  const onScroll = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    setScrollTop(node.scrollTop);
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setViewportHeight(node.clientHeight));
    observer.observe(node);
    setViewportHeight(node.clientHeight);
    return () => observer.disconnect();
  }, []);

  const window = useMemo(
    () => computeAiEmployeeListWindow(employees.length, scrollTop, viewportHeight),
    [employees.length, scrollTop, viewportHeight],
  );

  const visibleEmployees = useMemo(
    () => employees.slice(window.startIndex, window.endIndex),
    [employees, window.endIndex, window.startIndex],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border/60">
      <div className="grid grid-cols-[minmax(0,2fr)_repeat(7,minmax(0,1fr))_auto] gap-3 border-b border-border bg-muted/30 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{t("aiEmployees.table.employee")}</span>
        <span>{t("aiEmployees.table.status")}</span>
        <span>{t("aiEmployees.table.department")}</span>
        <span>{t("aiEmployees.table.provider")}</span>
        <span>{t("aiEmployees.table.model")}</span>
        <span>{t("aiEmployees.table.owner")}</span>
        <span>{t("aiEmployees.table.created")}</span>
        <span>{t("aiEmployees.table.updated")}</span>
        <span className="sr-only">{t("aiEmployees.table.actions")}</span>
      </div>

      <div ref={containerRef} className="max-h-[560px] overflow-auto" onScroll={onScroll}>
        <div style={{ height: window.totalHeight, position: "relative" }}>
          {visibleEmployees.map((employee, index) => (
            <AiEmployeeRow
              key={employee.id}
              employee={employee}
              canEdit={canEdit}
              canDelete={canDelete}
              onDelete={onDelete}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${(window.startIndex + index) * AI_EMPLOYEE_LIST_ROW_HEIGHT}px)`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
});
