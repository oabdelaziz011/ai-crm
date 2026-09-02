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
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Phone,
  Sparkles,
  Ticket,
  Wallet,
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
  resolveWorkspaceNavigation,
  workspaceTopTabToProfileTab,
  type WorkspaceTopTab,
} from "@/lib/customer-workspace/workspace-navigation";
import { cn } from "@/lib/utils";
import { formatCustomerPhoneDisplay, localizedCountryName } from "@/lib/customers/customer-phone-form";

const TOP_TAB_ICONS: Record<WorkspaceTopTab, ElementType> = {
  overview: LayoutGrid,
  activity: Activity,
  bookings: CalendarDays,
  invoices: FileText,
  communication: MessageSquare,
  tickets: Ticket,
  payments: Wallet,
  files: Paperclip,
  ai: Sparkles,
  campaigns: Megaphone,
  history: History,
};

export type CustomerWorkspaceShellProps = {
  customer: Customer;
  activeTab: CustomerProfileTab;
  accessibleTabs: WorkspaceTopTab[];
  onTabChange: (tab: CustomerProfileTab) => void;
  onBack: () => void;
  onQuickAction: (action: CustomerProfileQuickAction) => void;
  isQuickActionPending?: (action: CustomerProfileQuickAction) => boolean;
  canNewBooking?: boolean;
  canWhatsapp?: boolean;
  canCall?: boolean;
  ltv: number;
  outstanding: number;
  tags: string[];
  nextBooking: Booking | null;
  lastVisit: Booking | null;
  aiInsights: WorkspaceAiInsight[];
  showFinanceKpis?: boolean;
  showBookingKpis?: boolean;
  showAiInsights?: boolean;
  children: ReactNode;
};

export function CustomerWorkspaceShell({
  customer,
  activeTab,
  accessibleTabs,
  onTabChange,
  onBack,
  onQuickAction,
  isQuickActionPending,
  canNewBooking = false,
  canWhatsapp = false,
  canCall = false,
  ltv,
  outstanding,
  tags,
  nextBooking,
  lastVisit,
  aiInsights,
  showFinanceKpis = false,
  showBookingKpis = false,
  showAiInsights = false,
  children,
}: CustomerWorkspaceShellProps) {
  const { t, i18n } = useTranslation("common");
  const nav = resolveWorkspaceNavigation(activeTab);
  const activeTopTab = nav.primary;
  const statusDue = showFinanceKpis && outstanding > 0;
  const isVip = tags.includes("vip");
  const phoneDisplay = formatCustomerPhoneDisplay(customer);
  const phone = phoneDisplay.primary || null;
  const phoneCountry =
    phoneDisplay.countryIso != null
      ? localizedCountryName(
          phoneDisplay.countryIso,
          i18n.language?.startsWith("ar") ? "ar" : "en",
        )
      : null;
  const email = customer.email?.trim() || null;
  const lang = i18n.language;

  return (
    <div className="customer-workspace relative flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="relative z-10 flex min-h-0 flex-1">
        <aside className="hidden w-[272px] shrink-0 border-e border-border/60 bg-background lg:flex lg:flex-col">
          <div className="flex h-full min-h-0 flex-col overflow-y-auto">
            <div className="border-b border-border/60 px-4 py-4">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                onClick={onBack}
              >
                <ArrowLeft className="size-3.5" />
                {t("dashboard.customerWorkspace.backToList")}
              </Button>

              <div className="mt-3 flex items-start gap-3">
                <Avatar className="size-12 border border-border/70">
                  <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">
                    {customerInitials(customer.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="truncate text-[15px] font-semibold leading-tight">{customer.name}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <StatusPill due={statusDue} compact />
                    {isVip ? (
                      <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300">
                        {t("dashboard.customerWorkspace.tags.vip")}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="mt-3 flex w-full items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-[10px] font-mono text-muted-foreground hover:bg-primary/5"
                onClick={() => void navigator.clipboard.writeText(customer.id)}
                title={customer.id}
              >
                <Copy className="size-3 shrink-0 opacity-70" />
                <span className="truncate">{customer.id.slice(0, 8)}…</span>
              </button>
            </div>

            <SidebarSection title={t("dashboard.customerWorkspace.sections.contact")}>
              {phone ? (
                <SidebarField
                  icon={Phone}
                  label={t("forms.customer.phone")}
                  value={phoneCountry ? `${phone} · ${phoneCountry}` : phone}
                  dir="ltr"
                  emphasis
                />
              ) : null}
              {email ? (
                <SidebarField icon={Mail} label={t("forms.customer.email")} value={email} dir="ltr" />
              ) : null}
              {phone ? (
                <SidebarField
                  icon={MessageSquare}
                  label={t("dashboard.customerProfile.quickActions.whatsapp")}
                  value={t("dashboard.customerWorkspace.profile.whatsappAvailable")}
                />
              ) : null}
              {!phone && !email ? (
                <p className="px-1 py-1 text-xs text-muted-foreground">
                  {t("dashboard.customerWorkspace.profile.noContact")}
                </p>
              ) : null}
            </SidebarSection>

            <SidebarSection title={t("dashboard.customerWorkspace.sections.relationship")}>
              <SidebarField
                icon={CalendarDays}
                label={t("dashboard.customerWorkspace.assignedStaff")}
                value={t("dashboard.customerWorkspace.unassigned")}
              />
              <SidebarField
                icon={Clock}
                label={t("dashboard.customerWorkspace.profile.customerSince")}
                value={fmtDate(customer.created_at, lang)}
              />
            </SidebarSection>

            <div className="mx-3 my-3 rounded-xl border border-border/60 bg-background p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {t("dashboard.customerWorkspace.sections.value")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {showFinanceKpis ? (
                  <>
                    <ValueTile label={t("dashboard.customerWorkspace.ltv")} value={fmtCurrency(ltv)} tone="primary" />
                    <ValueTile
                      label={t("dashboard.customerWorkspace.outstandingShort")}
                      value={fmtCurrency(outstanding)}
                      tone={outstanding > 0 ? "warning" : "muted"}
                    />
                  </>
                ) : null}
                {showBookingKpis ? (
                  <>
                    <ValueTile
                      label={t("dashboard.customerWorkspace.profile.nextBooking")}
                      value={nextBooking ? fmtDate(nextBooking.booking_date, lang) : "—"}
                    />
                    <ValueTile
                      label={t("dashboard.customerWorkspace.profile.lastVisit")}
                      value={lastVisit ? fmtDate(lastVisit.booking_date, lang) : "—"}
                    />
                  </>
                ) : null}
              </div>
            </div>

            {showAiInsights ? (
            <div className="mt-auto border-t border-border/60 p-3">
              <WorkspaceAiInsights
                insights={aiInsights}
                compact
                onInsightAction={(insight) => {
                  if (insight.actionTab) onTabChange(insight.actionTab);
                }}
              />
            </div>
            ) : null}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="shrink-0 border-b border-border/60 bg-background">
            <div className="flex flex-col gap-3 px-4 py-3 lg:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ms-2 mb-1 h-7 gap-1.5 lg:hidden"
                    onClick={onBack}
                  >
                    <ArrowLeft className="size-3.5" />
                    {t("dashboard.customerWorkspace.backToList")}
                  </Button>
                  <nav className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <button type="button" onClick={onBack} className="hover:text-foreground">
                      {t("dashboard.customers.title")}
                    </button>
                    <ChevronRight className="size-3 opacity-50" />
                    <span className="truncate font-medium text-foreground">{customer.name}</span>
                  </nav>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-xl font-bold tracking-tight lg:text-2xl">{customer.name}</h2>
                    <StatusPill due={statusDue} />
                  </div>
                  {(phone || email) && (
                    <p className="mt-1 truncate text-sm text-muted-foreground" dir="ltr">
                      {[phone, email].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>

                {(canNewBooking || canWhatsapp || canCall) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="h-9 gap-1.5 rounded-xl px-3 text-xs font-semibold">
                      {t("dashboard.customerWorkspace.actionsMenu")}
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {canNewBooking ? (
                    <DropdownMenuItem
                      onClick={() => onQuickAction("new-booking")}
                      disabled={isQuickActionPending?.("new-booking")}
                    >
                      <CalendarDays className="me-2 size-4" />
                      {t("dashboard.customerWorkspace.header.newBooking")}
                    </DropdownMenuItem>
                    ) : null}
                    {canNewBooking && (canWhatsapp || canCall) ? <DropdownMenuSeparator /> : null}
                    {canWhatsapp ? (
                    <DropdownMenuItem
                      onClick={() => onQuickAction("whatsapp")}
                      disabled={!phone || isQuickActionPending?.("whatsapp")}
                    >
                      <MessageSquare className="me-2 size-4" />
                      {t("dashboard.customerWorkspace.header.message")}
                    </DropdownMenuItem>
                    ) : null}
                    {canCall ? (
                    <DropdownMenuItem
                      onClick={() => onQuickAction("call")}
                      disabled={!phone || isQuickActionPending?.("call")}
                    >
                      <Phone className="me-2 size-4" />
                      {t("dashboard.customerWorkspace.profile.call")}
                    </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
                )}
              </div>

              {(showFinanceKpis || showBookingKpis) && (
              <div className="grid grid-cols-2 gap-2 lg:hidden">
                {showFinanceKpis ? (
                <HeaderKpi
                  icon={DollarSign}
                  label={t("dashboard.customerWorkspace.outstandingShort")}
                  value={fmtCurrency(outstanding)}
                  tone={outstanding > 0 ? "warning" : undefined}
                />
                ) : null}
                {showBookingKpis ? (
                <HeaderKpi
                  icon={CalendarDays}
                  label={t("dashboard.customerWorkspace.profile.nextBooking")}
                  value={nextBooking ? fmtDate(nextBooking.booking_date, lang) : "—"}
                />
                ) : null}
              </div>
              )}

              {/* Flat top-level tab strip — horizontal scroll when needed (no More menu). */}
              <div
                className="overflow-x-auto overscroll-x-contain rounded-xl border border-border/60 bg-background p-1 [scrollbar-width:thin]"
                role="tablist"
                aria-label={t("dashboard.customerWorkspace.tabsLabel")}
              >
                <div className="flex w-max min-w-full flex-nowrap items-center gap-1">
                  {accessibleTabs.map((tab) => {
                    const Icon = TOP_TAB_ICONS[tab];
                    const active = activeTopTab === tab;
                    return (
                      <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onTabChange(workspaceTopTabToProfileTab(tab))}
                        className={cn(
                          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition-colors",
                          active
                            ? "bg-card text-foreground shadow-sm ring-1 ring-border/70"
                            : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                        )}
                      >
                        <Icon className="size-3.5 shrink-0" />
                        <span className="whitespace-nowrap">
                          {t(`dashboard.customerWorkspace.tabs.${tab}`)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background px-4 py-3 lg:px-5 lg:py-4">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-border/60 px-4 py-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SidebarField({
  icon: Icon,
  label,
  value,
  dir,
  emphasis,
}: {
  icon: ElementType;
  label: string;
  value: string | null | undefined;
  dir?: "ltr" | "rtl";
  emphasis?: boolean;
}) {
  if (!value?.trim()) return null;
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-muted/50">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
        <Icon className="size-3.5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p dir={dir} className={cn("truncate text-xs font-medium", emphasis && "text-[13px] font-semibold")}>
          {value}
        </p>
      </div>
    </div>
  );
}

function ValueTile({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "primary" | "warning" | "muted";
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background px-2.5 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 truncate text-xs font-semibold tabular-nums",
          tone === "primary" && "text-primary",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function HeaderKpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ElementType;
  label: string;
  value: string;
  tone?: "warning";
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-1.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
        <Icon className="size-3.5 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        <p className={cn("truncate text-[13px] font-semibold tabular-nums", tone === "warning" && "text-warning")}>
          {value}
        </p>
      </div>
    </div>
  );
}

function StatusPill({ due, compact }: { due: boolean; compact?: boolean }) {
  const { t } = useTranslation("common");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold",
        compact ? "px-1.5 py-0.5 text-[8px]" : "px-2.5 py-1 text-[10px]",
        due
          ? "bg-warning/15 text-warning ring-1 ring-warning/25"
          : "bg-success/15 text-success ring-1 ring-success/25",
      )}
    >
      <span className={cn("rounded-full", compact ? "size-1" : "size-1.5", due ? "bg-warning" : "bg-success")} />
      {due ? t("dashboard.customerWorkspace.statusDue") : t("dashboard.customerWorkspace.statusActive")}
    </span>
  );
}
