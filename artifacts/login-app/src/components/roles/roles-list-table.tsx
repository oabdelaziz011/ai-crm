import { Lock, MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RoleRecord } from "@/hooks/use-rbac";
import {
  canonicalRoleType,
  isPlatformSuperAdminRole,
  type CanonicalRoleType,
  type RoleListActions,
} from "@/lib/rbac/roles-list";
import { cn } from "@/lib/utils";

export type RolesListRow = {
  role: RoleRecord;
  permissionCount: number | null;
  userCount: number | null;
  actions: RoleListActions;
};

type Props = {
  rows: RolesListRow[];
  onView: (role: RoleRecord) => void;
  onEdit: (role: RoleRecord) => void;
  onDelete: (role: RoleRecord) => void;
  onOpenPermissions: (role: RoleRecord) => void;
};

const cellPad = "px-3 py-2.5";
const headPad = "px-3 py-2";

function typeBadgeClass(type: CanonicalRoleType): string {
  if (type === "PLATFORM") {
    return "border-border bg-muted/70 text-foreground";
  }
  if (type === "DEFAULT") {
    return "border-border bg-muted/40 text-muted-foreground";
  }
  return "border-primary/20 bg-primary/10 text-primary";
}

function formatUpdatedAt(iso: string | undefined, language: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const locale = language.startsWith("ar") ? "ar" : "en";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function Unavailable() {
  return (
    <span className="text-muted-foreground" dir="ltr">
      —
    </span>
  );
}

export function RolesListTable({ rows, onView, onEdit, onDelete, onOpenPermissions }: Props) {
  const { t, i18n } = useTranslation("common");
  const language = i18n.resolvedLanguage ?? i18n.language ?? "en";

  const typeLabel = (type: CanonicalRoleType) => {
    if (type === "PLATFORM") return t("roles.list.typePlatform");
    if (type === "DEFAULT") return t("roles.list.typeDefault");
    return t("roles.list.typeCustom");
  };

  return (
    <>
      <div className="hidden md:block" data-testid="roles-list-table">
        <table className="w-full border-collapse text-start text-sm">
          <thead className="border-b border-border/60 bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className={cn(headPad, "font-medium")}>{t("roles.list.columns.name")}</th>
              <th className={cn(headPad, "font-medium")}>{t("roles.list.columns.type")}</th>
              <th className={cn(headPad, "hidden font-medium lg:table-cell")}>
                {t("roles.list.columns.description")}
              </th>
              <th className={cn(headPad, "font-medium")}>{t("roles.list.columns.permissions")}</th>
              <th className={cn(headPad, "font-medium")}>{t("roles.list.columns.users")}</th>
              <th className={cn(headPad, "hidden font-medium xl:table-cell")}>
                {t("roles.list.columns.updated")}
              </th>
              <th className={cn(headPad, "w-14 font-medium")}>{t("roles.list.columns.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const type = canonicalRoleType(row.role);
              const platform = isPlatformSuperAdminRole(row.role);
              const updated = formatUpdatedAt(row.role.updated_at ?? row.role.created_at, language);
              return (
                <tr
                  key={row.role.id}
                  data-testid={`role-row-${row.role.id}`}
                  data-role-type={type}
                  className="border-b border-border/40 last:border-0 hover:bg-muted/30"
                >
                  <td className={cn(cellPad, "align-middle")}>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{row.role.name}</p>
                      {platform ? (
                        <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Lock className="size-3" aria-hidden />
                          {t("roles.systemRole")}
                        </p>
                      ) : null}
                    </div>
                  </td>
                  <td className={cn(cellPad, "align-middle")}>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
                        typeBadgeClass(type),
                      )}
                    >
                      {typeLabel(type)}
                    </span>
                  </td>
                  <td className={cn(cellPad, "hidden max-w-[18rem] align-middle lg:table-cell")}>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.role.description?.trim() || t("roles.noDescription")}
                    </p>
                  </td>
                  <td className={cn(cellPad, "align-middle")}>
                    {row.permissionCount == null ? (
                      <Unavailable />
                    ) : (
                      <button
                        type="button"
                        className="text-start text-xs font-medium text-foreground hover:text-primary"
                        dir="ltr"
                        onClick={() => onOpenPermissions(row.role)}
                      >
                        {t("roles.list.permissionCount", { count: row.permissionCount })}
                      </button>
                    )}
                  </td>
                  <td className={cn(cellPad, "align-middle")}>
                    {row.userCount == null ? (
                      <Unavailable />
                    ) : (
                      <span className="text-xs tabular-nums" dir="ltr">
                        {t("roles.list.userCount", { count: row.userCount })}
                      </span>
                    )}
                  </td>
                  <td className={cn(cellPad, "hidden align-middle text-xs text-muted-foreground xl:table-cell")}>
                    {updated ? (
                      <span dir="ltr">{updated}</span>
                    ) : (
                      <Unavailable />
                    )}
                  </td>
                  <td className={cn(cellPad, "align-middle")}>
                    <RoleRowMenu row={row} onView={onView} onEdit={onEdit} onDelete={onDelete} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 md:hidden" data-testid="roles-list-cards">
        {rows.map((row) => {
          const type = canonicalRoleType(row.role);
          const platform = isPlatformSuperAdminRole(row.role);
          const updated = formatUpdatedAt(row.role.updated_at ?? row.role.created_at, language);
          return (
            <article
              key={row.role.id}
              data-testid={`role-card-${row.role.id}`}
              data-role-type={type}
              className="rounded-xl border border-border/60 bg-card px-3 py-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{row.role.name}</p>
                  {platform ? (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Lock className="size-3" aria-hidden />
                      {t("roles.systemRole")}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.role.description?.trim() || t("roles.noDescription")}
                  </p>
                </div>
                <RoleRowMenu row={row} onView={onView} onEdit={onEdit} onDelete={onDelete} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={cn(
                    "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
                    typeBadgeClass(type),
                  )}
                >
                  {typeLabel(type)}
                </span>
                {row.permissionCount == null ? (
                  <Unavailable />
                ) : (
                  <button
                    type="button"
                    className="font-medium hover:text-primary"
                    dir="ltr"
                    onClick={() => onOpenPermissions(row.role)}
                  >
                    {t("roles.list.permissionCount", { count: row.permissionCount })}
                  </button>
                )}
                {row.userCount == null ? (
                  <Unavailable />
                ) : (
                  <span className="tabular-nums text-muted-foreground" dir="ltr">
                    {t("roles.list.userCount", { count: row.userCount })}
                  </span>
                )}
                {updated ? (
                  <span className="text-muted-foreground" dir="ltr">
                    {updated}
                  </span>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function RoleRowMenu({
  row,
  onView,
  onEdit,
  onDelete,
}: {
  row: RolesListRow;
  onView: (role: RoleRecord) => void;
  onEdit: (role: RoleRecord) => void;
  onDelete: (role: RoleRecord) => void;
}) {
  const { t } = useTranslation("common");
  const { actions, role } = row;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          data-testid={`role-actions-${role.id}`}
          aria-label={t("roles.list.actionsMenu")}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {actions.view ? (
          <DropdownMenuItem onClick={() => onView(role)}>
            {actions.viewOnly ? t("roles.viewOnly") : t("roles.view")}
          </DropdownMenuItem>
        ) : null}
        {actions.edit ? (
          <DropdownMenuItem onClick={() => onEdit(role)}>{t("roles.edit")}</DropdownMenuItem>
        ) : null}
        {actions.delete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(role)}
            >
              {t("roles.delete")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RolesListSkeleton() {
  return (
    <div data-testid="roles-list-skeleton" className="space-y-2 p-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-11 animate-pulse rounded-lg bg-muted/60" />
      ))}
    </div>
  );
}
