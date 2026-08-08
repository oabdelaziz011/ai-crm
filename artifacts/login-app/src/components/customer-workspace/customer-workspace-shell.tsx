import type { ElementType, ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Clock,
  Copy,
  DollarSign,
  FileText,
  History,
  LayoutGrid,
  Mail,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Phone,
  Pin,
  Printer,
  Share2,
  ShoppingBag,
  Sparkles,
  Star,
  Download,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CustomerProfileQuickAction, CustomerProfileTab } from "@/components/customer-profile/types";
import { WorkspaceAiInsights } from "@/components/customer-workspace/workspace-ai-insights";
import type { Booking, Customer } from "@/lib/types";
import {
  customerInitials,
  fmtCurrency,
  fmtDate,
  type WorkspaceAiInsight,
} from "@/lib/customer-workspace/customer-workspace-utils";
import {
  COMMERCE_SUB_TABS,
  resolveWorkspaceNavigation,
  WORKSPACE_PRIMARY_TABS,
  type CommerceSubTab,
  type WorkspacePrimaryTab,
} from "@/lib/customer-workspace/workspace-navigation";
import { cn } from "@/lib/utils";

const PRIMARY_ICONS: Record<WorkspacePrimaryTab, ElementType> = {
  overview: LayoutGrid,
  activity: Activity,
  commerce: ShoppingBag,
  communication: MessageSquare,
  files: Paperclip,
  ai: Sparkles,
  history: History,
};

const PRIMARY_TO_TAB: Record<WorkspacePrimaryTab, CustomerProfileTab> = {
  overview: "overview",
  activity: "timeline",
  commerce: "bookings",
  communication: "communication",
  files: "files",
  ai: "ai-summary",
  history: "history",
};

export type CustomerWorkspaceShellProps = {
  customer: Customer;
  activeTab: CustomerProfileTab;
  onTabChange: (tab: CustomerProfileTab) => void;
  onBack: () => void;
  onQuickAction: (action: CustomerProfileQuickAction) => void;
  isQuickActionPending?: (action: CustomerProfileQuickAction) => boolean;
  ltv: number;
  outstanding: number;
  tags: string[];
  nextBooking: Booking | null;
  lastVisit: Booking | null;
  aiInsights: WorkspaceAiInsight[];
  children: ReactNode;
};

export function CustomerWorkspaceShell({
  customer,
  activeTab,
  onTabChange,
  onBack,
  onQuickAction,
  isQuickActionPending,
  ltv,
  outstanding,
  tags,
  nextBooking,
  lastVisit,
  aiInsights,
  children,
}: CustomerWorkspaceShellProps) {
  const { t } = useTranslation("common");
  const nav = resolveWorkspaceNavigation(activeTab);
  const statusDue = outstanding > 0;
  const isVip = tags.includes("vip");

  const handlePrimaryTab = (primary: WorkspacePrimaryTab) => {
    onTabChange(PRIMARY_TO_TAB[primary]);
  };

  const handleCommerceSub = (sub: CommerceSubTab) => {
    onTabChange(sub);
  };

  const handleInsightAction = (insight: WorkspaceAiInsight) => {
    if (insight.actionTab) onTabChange(insight.actionTab);
  };

  return (
    <div className="customer-workspace flex min-h-[calc(100dvh-4rem)] flex-col bg-[hsl(222_44%_7%)]">
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-35"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 65% 45% at 12% 0%, hsl(var(--primary) / 0.09), transparent 55%), radial-gradient(ellipse 45% 40% at 100% 10%, hsl(222 40% 16% / 0.6), transparent 50%)",
        }}
      />

      <div className="relative z-10 flex min-h-0 flex-1">
        {/* COMPRESSED PROFILE SIDEBAR */}
        <aside className="hidden w-[272px] shrink-0 border-e border-border/70 bg-card/75 backdrop-blur-xl xl:w-[288px] lg:flex lg:flex-col">
          <div className="sticky top-0 flex max-h-[calc(100dvh-4rem)] flex-col overflow-y-auto text-sm">
            <div className="border-b border-border/50 px-3 py-3">
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground" onClick={onBack}>
                <ArrowLeft className="size-3.5" />
                {t("dashboard.customerWorkspace.backToList")}
              </Button>

              <div className="mt-2 flex items-center gap-3">
                <Avatar className="size-11 border-2 border-primary/25">
                  <AvatarFallback className="bg-primary/15 text-sm font-bold text-primary">
                    {customerInitials(customer.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold leading-tight">{customer.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <StatusPill due={statusDue} compact />
                    {isVip && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-400">
                        {t("dashboard.customerWorkspace.tags.vip")}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="mt-2 flex w-full items-center gap-1.5 rounded-md bg-muted/25 px-2 py-1 text-[10px] font-mono text-muted-foreground hover:bg-muted/40"
                onClick={() => void navigator.clipboard.writeText(customer.id)}
              >
                <Copy className="size-3 shrink-0" />
                <span className="truncate">{customer.id.slice(0, 8)}…</span>
              </button>
            </div>

            <SidebarSection>
              <SidebarField icon={Phone} label={t("forms.customer.phone")} value={customer.phone} dir="ltr" />
              <SidebarField icon={Mail} label={t("forms.customer.email")} value={customer.email} dir="ltr" />
              <SidebarField icon={MessageSquare} label="WhatsApp" value={customer.phone ? t("dashboard.customerWorkspace.profile.whatsappAvailable") : null} />
              <SidebarField icon={MapPin} label={t("dashboard.customerWorkspace.profile.address")} value={null} />
            </SidebarSection>

            <SidebarSection>
              <SidebarField icon={CalendarDays} label={t("dashboard.customerWorkspace.assignedStaff")} value={t("dashboard.customerWorkspace.unassigned")} />
              <SidebarField
                icon={Clock}
                label={t("dashboard.customerWorkspace.profile.customerSince")}
                value={fmtDate(customer.created_at)}
              />
              <SidebarField icon={MapPin} label={t("dashboard.customerWorkspace.profile.branch")} value={t("dashboard.customerWorkspace.profile.notSet")} />
              <SidebarField icon={Activity} label={t("dashboard.customerWorkspace.profile.source")} value={t("dashboard.customerWorkspace.profile.direct")} />
            </SidebarSection>

            <SidebarSection className="bg-muted/10 mx-2 rounded-lg px-2 py-2">
              <SidebarMetric label={t("dashboard.customerWorkspace.ltv")} value={fmtCurrency(ltv)} highlight />
              <SidebarMetric label={t("dashboard.customerWorkspace.outstanding")} value={fmtCurrency(outstanding)} warn={outstanding > 0} />
              <SidebarMetric
                label={t("dashboard.customerWorkspace.profile.nextBooking")}
                value={nextBooking ? fmtDate(nextBooking.booking_date) : "—"}
              />
              <SidebarMetric
                label={t("dashboard.customerWorkspace.profile.lastVisit")}
                value={lastVisit ? fmtDate(lastVisit.booking_date) : "—"}
              />
            </SidebarSection>

            <div className="space-y-1 px-2 py-2">
              <p className="px-1 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {t("dashboard.customerProfile.quickActions.title")}
              </p>
              <div className="grid grid-cols-2 gap-1">
                <QuickChip icon={MessageSquare} label={t("dashboard.customerWorkspace.header.message")} onClick={() => onQuickAction("whatsapp")} disabled={!customer.phone?.trim()} />
                <QuickChip icon={CalendarDays} label={t("dashboard.customerWorkspace.profile.book")} onClick={() => onQuickAction("new-booking")} />
                <QuickChip icon={FileText} label={t("dashboard.customerWorkspace.profile.invoice")} onClick={() => onQuickAction("new-invoice")} />
                <QuickChip icon={Phone} label={t("dashboard.customerWorkspace.profile.call")} onClick={() => onQuickAction("call")} disabled={!customer.phone?.trim()} />
              </div>
              <div className="grid grid-cols-2 gap-1 pt-1">
                <QuickChip icon={Pin} label={t("dashboard.customerWorkspace.profile.pin")} onClick={() => {}} disabled />
                <QuickChip icon={Star} label={t("dashboard.customerWorkspace.profile.favorite")} onClick={() => {}} disabled />
              </div>
            </div>

            <div className="mt-auto border-t border-border/50 p-2">
              <WorkspaceAiInsights insights={aiInsights} compact onInsightAction={handleInsightAction} />
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-border/70 bg-card/92 backdrop-blur-xl">
            <div className="flex flex-col gap-3 px-4 py-3 lg:px-8 lg:py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <Button variant="ghost" size="sm" className="-ms-2 mb-1 h-7 gap-1.5 lg:hidden" onClick={onBack}>
                    <ArrowLeft className="size-3.5" />
                    {t("dashboard.customerWorkspace.backToList")}
                  </Button>
                  <nav className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <button type="button" onClick={onBack} className="hover:text-foreground">{t("dashboard.customers.title")}</button>
                    <ChevronRight className="size-3 opacity-50" />
                    <span className="truncate font-medium text-foreground">{customer.name}</span>
                  </nav>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-2xl font-bold tracking-tight lg:text-[1.65rem]">{customer.name}</h2>
                    <StatusPill due={statusDue} />
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!customer.phone?.trim()} onClick={() => onQuickAction("whatsapp")}>
                    <MessageSquare className="size-3.5" />
                    {t("dashboard.customerWorkspace.header.message")}
                  </Button>
                  <Button size="sm" className="h-8 gap-1.5 text-xs shadow-sm" onClick={() => onQuickAction("new-booking")}>
                    <CalendarDays className="size-3.5" />
                    {t("dashboard.customerWorkspace.header.newBooking")}
                  </Button>
                  <Button variant="secondary" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => onQuickAction("new-invoice")}>
                    <DollarSign className="size-3.5" />
                    {t("dashboard.customerWorkspace.header.newInvoice")}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem disabled><Download className="me-2 size-4" />{t("dashboard.customerWorkspace.header.export")}</DropdownMenuItem>
                      <DropdownMenuItem disabled onClick={() => window.print()}><Printer className="me-2 size-4" />{t("dashboard.customerWorkspace.header.print")}</DropdownMenuItem>
                      <DropdownMenuItem disabled><Share2 className="me-2 size-4" />{t("dashboard.customerWorkspace.header.share")}</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onQuickAction("call")} disabled={!customer.phone?.trim()}><Phone className="me-2 size-4" />{t("dashboard.customerWorkspace.profile.call")}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onTabChange("history")}><History className="me-2 size-4" />{t("dashboard.customerWorkspace.tabs.history")}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {!nav.primary || nav.primary === "overview" ? null : (
                <WorkspaceAiInsights insights={aiInsights} compact className="lg:hidden" onInsightAction={handleInsightAction} />
              )}
            </div>

            <nav className="flex gap-0 overflow-x-auto border-t border-border/40 px-4 lg:px-8" aria-label={t("dashboard.customerWorkspace.tabsLabel")}>
              {WORKSPACE_PRIMARY_TABS.map((tab) => {
                const Icon = PRIMARY_ICONS[tab];
                const active = nav.primary === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => handlePrimaryTab(tab)}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[11px] font-semibold transition-all",
                      active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" />
                    {t(`dashboard.customerWorkspace.tabs.${tab}`)}
                  </button>
                );
              })}
            </nav>

            {nav.primary === "commerce" && (
              <nav className="flex gap-1 border-t border-border/30 bg-muted/10 px-4 py-1.5 lg:px-8">
                {COMMERCE_SUB_TABS.map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => handleCommerceSub(sub)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors",
                      nav.commerce === sub ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t(`dashboard.customerWorkspace.commerce.${sub}`)}
                  </button>
                ))}
              </nav>
            )}
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-5 lg:px-8 lg:py-6 2xl:max-w-[1400px]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarSection({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-0.5 border-b border-border/40 px-3 py-2", className)}>
      {children}
    </div>
  );
}

function SidebarField({ icon: Icon, label, value, dir }: { icon: ElementType; label: string; value: string | null | undefined; dir?: "ltr" | "rtl" }) {
  const { t } = useTranslation("common");
  return (
    <div className="flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/15">
      <Icon className="size-3.5 shrink-0 text-primary/60" />
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p dir={dir} className="truncate text-xs font-medium">{value?.trim() || t("dashboard.customerWorkspace.profile.notSet")}</p>
      </div>
    </div>
  );
}

function SidebarMetric({ label, value, highlight, warn }: { label: string; value: string; highlight?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("truncate text-xs font-semibold tabular-nums", highlight && "text-primary", warn && "text-warning")}>{value}</span>
    </div>
  );
}

function QuickChip({ icon: Icon, label, onClick, disabled }: { icon: ElementType; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md border border-border/50 bg-background/40 px-2 py-1.5 text-[10px] font-semibold transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:opacity-40"
    >
      <Icon className="size-3 shrink-0 text-primary" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function StatusPill({ due, compact }: { due: boolean; compact?: boolean }) {
  const { t } = useTranslation("common");
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wide",
      compact ? "px-1.5 py-0.5 text-[8px]" : "px-2 py-0.5 text-[10px]",
      due ? "bg-warning/15 text-warning" : "bg-success/15 text-success",
    )}>
      <span className={cn("rounded-full", compact ? "size-1" : "size-1.5", due ? "bg-warning" : "bg-success")} />
      {due ? t("dashboard.customerWorkspace.statusDue") : t("dashboard.customerWorkspace.statusActive")}
    </span>
  );
}
