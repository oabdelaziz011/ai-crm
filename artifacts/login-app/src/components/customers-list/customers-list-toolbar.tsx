import {
  ArrowDownUp,
  Columns3,
  Download,
  Filter,
  LayoutList,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  BUILT_IN_VIEWS,
  isCustomSavedView,
  type CustomerColumnId,
  type CustomerListDensity,
  type CustomerSortField,
  type CustomSavedView,
  type CustomerSavedView,
  type SortDirection,
} from "@/lib/customers-list";

type CustomersListToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  activeViewId: string;
  onViewChange: (viewId: string) => void;
  customViews: CustomSavedView[];
  onOpenFilters: () => void;
  filterCount: number;
  sortField: CustomerSortField;
  sortDirection: SortDirection;
  onSortChange: (field: CustomerSortField, direction: SortDirection) => void;
  density: CustomerListDensity;
  onDensityChange: (density: CustomerListDensity) => void;
  columnOrder: CustomerColumnId[];
  columnVisibility: Record<CustomerColumnId, boolean>;
  onToggleColumn: (columnId: CustomerColumnId) => void;
  onMoveColumn: (columnId: CustomerColumnId, direction: "up" | "down") => void;
  onExport: () => void;
  onImport: () => void;
  onCreate: () => void;
  canCreate?: boolean;
};

const SORT_OPTIONS: CustomerSortField[] = [
  "name",
  "company",
  "created_at",
  "ltv",
  "outstanding",
  "lastActivity",
  "nextAppointment",
];

const COLUMN_LABEL_KEYS: Record<CustomerColumnId, string> = {
  select: "dashboard.customers.list.columns.select",
  customer: "dashboard.customers.list.columns.customer",
  tags: "dashboard.customers.list.columns.tags",
  company: "dashboard.customers.list.columns.company",
  phone: "dashboard.customers.list.columns.phone",
  email: "dashboard.customers.list.columns.email",
  assigned: "dashboard.customers.list.columns.assigned",
  nextAppointment: "dashboard.customers.list.columns.nextAppointment",
  outstanding: "dashboard.customers.list.columns.outstanding",
  ltv: "dashboard.customers.list.columns.ltv",
  status: "dashboard.customers.list.columns.status",
  lastActivity: "dashboard.customers.list.columns.lastActivity",
  actions: "dashboard.customers.list.columns.actions",
};

export function CustomersListToolbar({
  search,
  onSearchChange,
  activeViewId,
  onViewChange,
  customViews,
  onOpenFilters,
  filterCount,
  sortField,
  sortDirection,
  onSortChange,
  density,
  onDensityChange,
  columnOrder,
  columnVisibility,
  onToggleColumn,
  onMoveColumn,
  onExport,
  onImport,
  onCreate,
  canCreate,
}: CustomersListToolbarProps) {
  const { t } = useTranslation("common");

  const allViews: CustomerSavedView[] = [
    ...BUILT_IN_VIEWS,
    ...customViews,
  ];

  const activeView = allViews.find((view) => view.id === activeViewId);
  const activeViewLabel = activeView
    ? isCustomSavedView(activeView)
      ? activeView.label
      : t(activeView.labelKey)
    : t(BUILT_IN_VIEWS[0].labelKey);

  return (
    <div className="sticky top-0 z-20 -mx-1 space-y-3 rounded-xl border border-border bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            {t("dashboard.customers.title")}
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {t("dashboard.customers.subtitle")}
          </p>
        </div>
        {canCreate && (
          <Button
            onClick={onCreate}
            className="shrink-0 bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary gap-2"
          >
            <Plus className="h-4 w-4" />
            {t("buttons.addCustomer")}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("dashboard.customers.list.searchPlaceholder")}
            className={cn(
              "h-10 w-full rounded-xl border border-border bg-muted/20 ps-9 pe-3 text-sm outline-none",
              "placeholder:text-muted-foreground focus:border-primary/40 focus:ring-1 focus:ring-primary/20",
            )}
            aria-label={t("dashboard.customers.list.searchPlaceholder")}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 border-border">
                <LayoutList className="h-3.5 w-3.5" />
                <span className="max-w-[120px] truncate">
                  {activeViewLabel}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>{t("dashboard.customers.list.views.title")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {allViews.map((view) => (
                <DropdownMenuItem key={view.id} onClick={() => onViewChange(view.id)}>
                  {isCustomSavedView(view) ? view.label : t(view.labelKey)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-border"
            onClick={onOpenFilters}
          >
            <Filter className="h-3.5 w-3.5" />
            {t("buttons.filter")}
            {filterCount > 0 && (
              <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {filterCount}
              </span>
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 border-border">
                <ArrowDownUp className="h-3.5 w-3.5" />
                {t("dashboard.customers.list.sort")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>{t("dashboard.customers.list.sortBy")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={sortField}
                onValueChange={(value) => onSortChange(value as CustomerSortField, sortDirection)}
              >
                {SORT_OPTIONS.map((field) => (
                  <DropdownMenuRadioItem key={field} value={field}>
                    {t(`dashboard.customers.list.sortFields.${field}`)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={sortDirection}
                onValueChange={(value) => onSortChange(sortField, value as SortDirection)}
              >
                <DropdownMenuRadioItem value="asc">
                  {t("dashboard.customers.list.sortAsc")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="desc">
                  {t("dashboard.customers.list.sortDesc")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 border-border">
                <Columns3 className="h-3.5 w-3.5" />
                {t("dashboard.customers.list.columns.title")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 max-h-80 overflow-y-auto">
              <DropdownMenuLabel>{t("dashboard.customers.list.columns.manage")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columnOrder
                .filter((id) => id !== "select" && id !== "actions")
                .map((columnId, index, arr) => (
                  <div key={columnId} className="flex items-center gap-1 px-1">
                    <DropdownMenuCheckboxItem
                      checked={columnVisibility[columnId]}
                      onCheckedChange={() => onToggleColumn(columnId)}
                      className="flex-1"
                    >
                      {t(COLUMN_LABEL_KEYS[columnId])}
                    </DropdownMenuCheckboxItem>
                    <div className="flex shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={index === 0}
                        onClick={(e) => {
                          e.preventDefault();
                          onMoveColumn(columnId, "up");
                        }}
                      >
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={index === arr.length - 1}
                        onClick={(e) => {
                          e.preventDefault();
                          onMoveColumn(columnId, "down");
                        }}
                      >
                        ↓
                      </Button>
                    </div>
                  </div>
                ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("dashboard.customers.list.density.title")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={density}
                onValueChange={(value) => onDensityChange(value as CustomerListDensity)}
              >
                <DropdownMenuRadioItem value="comfortable">
                  {t("dashboard.customers.list.density.comfortable")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="compact">
                  {t("dashboard.customers.list.density.compact")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="ultra">
                  {t("dashboard.customers.list.density.ultra")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" className="h-9 gap-1.5 border-border" onClick={onImport}>
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{t("dashboard.customers.list.import")}</span>
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 border-border" onClick={onExport}>
            <Download className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{t("dashboard.customers.list.export")}</span>
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 border-border xl:hidden"
            onClick={onOpenFilters}
            aria-label={t("buttons.filter")}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
