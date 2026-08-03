import {
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  Search,
  Star,
  X,
} from "lucide-react";
import type { OperationsCustomer360WorkspaceData } from "@workspace/universal-operations-engine";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Customer360Badge } from "@/components/universal-operations/customer360/customer360-ui";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function Customer360StickyHeader({
  data,
  reference,
  collapsed,
  onToggleCollapse,
  onClose,
}: {
  data: OperationsCustomer360WorkspaceData;
  reference: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("common");
  const { customer, summary, todaysOperation } = data;

  return (
    <div className="sticky top-0 z-30 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur-md">
      <div className="flex items-start gap-3">
        <Avatar className="size-11 ring-2 ring-primary/20">
          <AvatarFallback style={{ backgroundColor: `${customer.avatarColor}22`, color: customer.avatarColor }}>
            {initials(customer.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="truncate text-base font-bold tracking-tight">{customer.name}</h2>
            {summary.isVip && <Customer360Badge label="VIP" tone="vip" />}
            <Customer360Badge label={data.currentStatus} tone="success" />
            <Customer360Badge label={data.currentPaymentStatus} tone="warning" />
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {reference} · {todaysOperation.service} · {data.assignedResource}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {new Date(todaysOperation.scheduledAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="inline-flex items-center gap-1">
              <CreditCard className="size-3" />
              {data.currentPaymentStatus}
            </span>
            <span className="inline-flex items-center gap-1">
              <Star className="size-3" />
              {t("customer360.header.customerSince")} {summary.customerSince}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" className="size-8" onClick={onToggleCollapse} aria-label={t("customer360.header.collapse")}>
            {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>
      {!collapsed && (
        <div className="relative mt-3">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={t("customer360.header.quickSearch")} className="h-8 pl-8 text-xs" />
        </div>
      )}
    </div>
  );
}
