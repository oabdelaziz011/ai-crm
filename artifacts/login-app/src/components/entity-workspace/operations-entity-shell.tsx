import type { ElementType, ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  Banknote,
  Copy,
  LayoutGrid,
  Link2,
  ListTodo,
  MessageCircle,
  MessageSquare,
  Paperclip,
  Phone,
  Search,
  StickyNote,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import type { EntityWorkspaceTabId } from "@/lib/entity-workspace";
import { cn } from "@/lib/utils";

export type OperationsEntityShellTab = {
  id: EntityWorkspaceTabId;
  labelKey: string;
  icon: ElementType;
};

export type OperationsEntityShellProps = {
  title: string;
  entityTypeLabel: string;
  subtitle?: string | null;
  initials: string;
  tags?: string[];
  statusLabel?: string | null;
  resourceLabel?: string | null;
  branchLabel?: string | null;
  operationLabel?: string | null;
  lastActivityLabel?: string | null;
  ownerLabel?: string | null;
  tabs: OperationsEntityShellTab[];
  activeTab: EntityWorkspaceTabId;
  onTabChange: (tab: EntityWorkspaceTabId) => void;
  onBack: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  showSearch?: boolean;
  onAddNote?: () => void;
  onCollectPayment?: () => void;
  onCall?: () => void;
  onWhatsapp?: () => void;
  onCopyLink?: () => void;
  showCollectPayment?: boolean;
  showCall?: boolean;
  showWhatsapp?: boolean;
  showAddNote?: boolean;
  children: ReactNode;
  sidebar?: ReactNode;
};

export function OperationsEntityShell({
  title,
  entityTypeLabel,
  subtitle,
  initials,
  tags = [],
  statusLabel,
  resourceLabel,
  branchLabel,
  operationLabel,
  lastActivityLabel,
  ownerLabel,
  tabs,
  activeTab,
  onTabChange,
  onBack,
  searchQuery,
  onSearchChange,
  showSearch = true,
  onAddNote,
  onCollectPayment,
  onCall,
  onWhatsapp,
  onCopyLink,
  showCollectPayment,
  showCall,
  showWhatsapp,
  showAddNote,
  children,
  sidebar,
}: OperationsEntityShellProps) {
  const { t } = useTranslation("common");

  return (
    <div className="flex min-h-0 flex-col gap-3 rounded-2xl bg-muted/25 p-3 md:p-4">
      <header className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm md:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 -ms-1 text-muted-foreground" onClick={onBack}>
            <ArrowLeft className="size-4" />
            {t("entityWorkspace.backToQueue")}
          </Button>
          <div className="ms-auto flex flex-wrap items-center gap-1.5">
            {showAddNote && onAddNote ? (
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={onAddNote}>
                <StickyNote className="size-3.5" />
                {t("entityWorkspace.actions.addNote")}
              </Button>
            ) : null}
            {showCollectPayment && onCollectPayment ? (
              <Button size="sm" className="h-8 gap-1.5" onClick={onCollectPayment}>
                <Banknote className="size-3.5" />
                {t("entityWorkspace.actions.collectPayment")}
              </Button>
            ) : null}
            {showCall && onCall ? (
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={onCall}>
                <Phone className="size-3.5" />
                {t("entityWorkspace.actions.call")}
              </Button>
            ) : null}
            {showWhatsapp && onWhatsapp ? (
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={onWhatsapp}>
                <MessageCircle className="size-3.5" />
                {t("entityWorkspace.actions.whatsapp", { defaultValue: "WhatsApp" })}
              </Button>
            ) : null}
            {onCopyLink ? (
              <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={onCopyLink}>
                <Copy className="size-3.5" />
                {t("entityWorkspace.actions.copyLink")}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-start gap-3">
          <Avatar className="size-12 border border-border/60 shadow-sm">
            <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
              <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {entityTypeLabel}
              </span>
              {statusLabel ? (
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  {statusLabel}
                </span>
              ) : null}
            </div>
            {subtitle ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p> : null}
            {tags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid w-full gap-1.5 text-xs sm:w-auto sm:min-w-[240px] sm:grid-cols-2">
            <HeaderMeta label={t("entityWorkspace.panels.currentOperation")} value={operationLabel} />
            <HeaderMeta label={t("entityWorkspace.panels.assignedResource")} value={resourceLabel} />
            <HeaderMeta label={t("entityWorkspace.header.branch")} value={branchLabel} />
            <HeaderMeta label={t("entityWorkspace.header.lastActivity")} value={lastActivityLabel} />
            <HeaderMeta label={t("entityWorkspace.header.owner")} value={ownerLabel} />
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 border-t border-border/50 pt-3 lg:flex-row lg:items-center">
          <nav className="flex min-w-0 flex-1 flex-wrap gap-1">
            {tabs.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                    active
                      ? "border border-primary/20 bg-primary/12 text-primary"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  {t(item.labelKey)}
                </button>
              );
            })}
          </nav>
          {showSearch ? (
            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={t("entityWorkspace.search.placeholder")}
                className="h-9 rounded-xl border-border/60 bg-background ps-8"
              />
            </div>
          ) : null}
        </div>
      </header>

      <div className="grid min-h-0 gap-3 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8 xl:col-span-9">{children}</div>
        {sidebar ? (
          <aside className="min-w-0 lg:sticky lg:top-3 lg:col-span-4 lg:self-start xl:col-span-3">
            {sidebar}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function HeaderMeta({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim() || value === "—") return null;
  return (
    <div className="rounded-xl bg-muted/30 px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate font-medium text-foreground">{value}</p>
    </div>
  );
}

export const DEFAULT_OPS_ENTITY_TABS: OperationsEntityShellTab[] = [
  { id: "overview", icon: LayoutGrid, labelKey: "entityWorkspace.tabs.overview" },
  { id: "notes", icon: StickyNote, labelKey: "entityWorkspace.tabs.notes" },
  { id: "files", icon: Paperclip, labelKey: "entityWorkspace.tabs.attachments" },
  { id: "communication", icon: MessageSquare, labelKey: "entityWorkspace.tabs.communication" },
  { id: "timeline", icon: Activity, labelKey: "entityWorkspace.tabs.timeline" },
  { id: "tasks", icon: ListTodo, labelKey: "entityWorkspace.tabs.tasks" },
  { id: "related", icon: Link2, labelKey: "entityWorkspace.tabs.related" },
];

export const OPS_ENTITY_SEARCHABLE_TABS: readonly EntityWorkspaceTabId[] = [
  "overview",
  "notes",
  "files",
  "timeline",
  "activity",
];
