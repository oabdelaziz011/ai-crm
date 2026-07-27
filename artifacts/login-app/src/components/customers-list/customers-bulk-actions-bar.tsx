import { memo } from "react";
import {
  Archive,
  CalendarPlus,
  Download,
  FileText,
  Mail,
  Megaphone,
  MoreHorizontal,
  Tag,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type CustomersBulkActionsBarProps = {
  selectedCount: number;
  onClear: () => void;
  onDelete?: () => void;
  onExport: () => void;
  onPlaceholder: (action: string) => void;
  canDelete?: boolean;
};

export const CustomersBulkActionsBar = memo(function CustomersBulkActionsBar({
  selectedCount,
  onClear,
  onDelete,
  onExport,
  onPlaceholder,
  canDelete,
}: CustomersBulkActionsBarProps) {
  const { t } = useTranslation("common");

  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        "sticky bottom-4 z-30 mx-auto flex max-w-4xl items-center gap-2 rounded-xl border border-primary/30",
        "bg-background/95 px-3 py-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80",
        "animate-in slide-in-from-bottom-2 duration-200",
      )}
    >
      <span className="text-sm font-medium px-2 tabular-nums">
        {t("dashboard.customers.list.bulk.selected", { count: selectedCount })}
      </span>
      <div className="h-4 w-px bg-border" />
      <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => onPlaceholder("assign")}>
        <UserPlus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t("dashboard.customers.list.bulk.assign")}</span>
      </Button>
      {canDelete && (
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t("buttons.delete")}</span>
        </Button>
      )}
      <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => onPlaceholder("archive")}>
        <Archive className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t("dashboard.customers.list.bulk.archive")}</span>
      </Button>
      <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => onPlaceholder("message")}>
        <Mail className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t("dashboard.customers.list.bulk.message")}</span>
      </Button>
      <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => onPlaceholder("campaign")}>
        <Megaphone className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t("dashboard.customers.list.bulk.campaign")}</span>
      </Button>
      <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onExport}>
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t("dashboard.customers.list.bulk.export")}</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onPlaceholder("tag")}>
            <Tag className="h-4 w-4 me-2" />
            {t("dashboard.customers.list.bulk.addTag")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onPlaceholder("invoice")}>
            <FileText className="h-4 w-4 me-2" />
            {t("dashboard.customers.list.bulk.invoice")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onPlaceholder("booking")}>
            <CalendarPlus className="h-4 w-4 me-2" />
            {t("dashboard.customers.list.bulk.booking")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="icon" className="ms-auto h-8 w-8 shrink-0" onClick={onClear}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
});
