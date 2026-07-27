import { Download, FileJson, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type OpsGlobalSearchProps = {
  value: string;
  onChange: (value: string) => void;
  onExportCsv: () => void;
  onExportJson: () => void;
};

export function OpsGlobalSearch({ value, onChange, onExportCsv, onExportJson }: OpsGlobalSearchProps) {
  const { t } = useTranslation("common");

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("platformAiOps.search.placeholder")}
          className="ps-9"
          aria-label={t("platformAiOps.search.label")}
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="size-4" />
            {t("platformAiOps.export.title")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onExportCsv}>
            <Download className="me-2 size-4" />
            {t("platformAiOps.export.csv")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExportJson}>
            <FileJson className="me-2 size-4" />
            {t("platformAiOps.export.json")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
