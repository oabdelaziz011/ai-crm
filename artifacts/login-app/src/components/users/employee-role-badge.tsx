import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  roleName: string | null | undefined;
  className?: string;
};

/** Deterministic ValueOR-token role chip (primary / secondary / outline). */
export function EmployeeRoleBadge({ roleName, className }: Props) {
  const { t } = useTranslation("common");
  const name = roleName?.trim();
  if (!name) {
    return (
      <span className="text-xs text-muted-foreground">
        {t("companyWorkspace.employees.notAssigned")}
      </span>
    );
  }

  const tone = hashTone(name);

  return (
    <Badge
      variant={tone === "primary" ? "default" : tone === "secondary" ? "secondary" : "outline"}
      className={cn(
        "max-w-[10rem] truncate px-2 py-0 text-[10px] font-semibold",
        tone === "primary" && "bg-primary/15 text-primary border-transparent shadow-none",
        tone === "secondary" && "bg-secondary text-secondary-foreground",
        tone === "outline" && "border-primary/25 bg-primary/5 text-foreground",
        className,
      )}
      title={name}
    >
      {name}
    </Badge>
  );
}

function hashTone(value: string): "primary" | "secondary" | "outline" {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  const tones = ["primary", "secondary", "outline"] as const;
  return tones[hash % tones.length]!;
}
