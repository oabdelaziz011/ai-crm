import type { ReactNode } from "react";
import { ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function CompanyColumnFilter({
  label,
  active,
  children,
}: {
  label: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-6 w-6 text-muted-foreground", active && "text-primary")}
          aria-label={label}
        >
          <ListFilter className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3 p-3">
        <p className="text-xs font-medium text-foreground">{label}</p>
        {children}
      </PopoverContent>
    </Popover>
  );
}
