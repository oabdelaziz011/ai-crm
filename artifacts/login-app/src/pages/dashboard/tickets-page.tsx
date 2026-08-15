import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Loader2, Plus, Search, Ticket, UserPlus } from "lucide-react";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketPriority,
} from "@workspace/ticket-platform";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { ModulePurposeBanner } from "@/components/dashboard/module-purpose-banner";
import {
  TicketPriorityBadge,
  TicketSlaBadge,
  TicketStatusBadge,
  formatTicketDateTime,
} from "@/components/tickets/ticket-badges";
import { Ticket360Workspace } from "@/components/tickets/ticket360-workspace";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  useTicketCommands,
  useTicketInboxMetrics,
  useTicketsList,
  type TicketListFilters,
} from "@/hooks/tickets/use-tickets";
import { useTicketServiceContext } from "@/hooks/tickets/use-ticket-services";
import { useCustomersEnrichment } from "@/hooks/use-customers";
import { EmployeeIdentityService } from "@/lib/employee-identity/employee-identity-service";
import {
  mapTicketInboxKpis,
  type TicketInboxKpiId,
} from "@/lib/tickets/ticket-inbox-metrics";
import type { TicketInboxRow } from "@/lib/tickets/enrich-ticket-rows";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

export function TicketsPage() {
  const { t, i18n } = useTranslation("common");
  const { company } = useAuth();
  const { toast } = useToast();
  const { canCreate, canAssign } = useTicketServiceContext();
  const commands = useTicketCommands();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TicketListFilters["status"]>("all");
  const [priorityFilter, setPriorityFilter] = useState<TicketListFilters["priority"]>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<TicketListFilters["sortBy"]>("updated_at");
  const [sortDir, setSortDir] = useState<TicketListFilters["sortDir"]>("desc");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTicketId, setAssignTicketId] = useState<string | null>(null);
  const [activeKpi, setActiveKpi] = useState<TicketInboxKpiId>("all");

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [customerId, setCustomerId] = useState<string>("none");
  const [customerSearch, setCustomerSearch] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, priorityFilter, assigneeFilter, sortBy, sortDir]);

  const filters = useMemo<TicketListFilters>(
    () => ({
      query: debouncedSearch,
      status: statusFilter,
      priority: priorityFilter,
      assignedUserId: assigneeFilter as TicketListFilters["assignedUserId"],
      sortBy,
      sortDir,
      page,
      pageSize: PAGE_SIZE,
    }),
    [assigneeFilter, debouncedSearch, page, priorityFilter, sortBy, sortDir, statusFilter],
  );

  const list = useTicketsList(filters);
  const metricsQuery = useTicketInboxMetrics();
  const { data: customers = [] } = useCustomersEnrichment();
  const kpis = useMemo(
    () => (metricsQuery.data ? mapTicketInboxKpis(metricsQuery.data) : []),
    [metricsQuery.data],
  );

  const customerOptions = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    const rows = customers.filter((row) => Boolean(row.id));
    const selected =
      customerId !== "none" ? rows.find((row) => row.id === customerId) ?? null : null;
    const filtered = q
      ? rows.filter((row) => {
          const haystack = `${row.name ?? ""} ${row.email ?? ""} ${row.phone ?? ""}`.toLowerCase();
          return haystack.includes(q);
        })
      : rows;
    const limited = filtered.slice(0, 80);
    if (selected && !limited.some((row) => row.id === selected.id)) {
      return [selected, ...limited];
    }
    return limited;
  }, [customerId, customerSearch, customers]);

  const selectedCustomer = useMemo(
    () => (customerId !== "none" ? customers.find((row) => row.id === customerId) ?? null : null),
    [customerId, customers],
  );

  const formatCustomerLabel = (customer: { name?: string | null; phone?: string | null; email?: string | null }) =>
    [customer.name?.trim() || null, customer.phone?.trim() || null, customer.email?.trim() || null]
      .filter(Boolean)
      .join(" · ");

  const employees = useQuery({
    queryKey: ["ticket-assignees", company?.id],
    enabled: Boolean(company?.id),
    staleTime: 60_000,
    queryFn: async () => {
      if (!company?.id) return [];
      return EmployeeIdentityService.listByCompany(company.id, 200);
    },
  });

  const activeAssignees = useMemo(
    () => (employees.data ?? []).filter((row) => row.status === "active"),
    [employees.data],
  );

  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openAssign = (ticketId: string) => {
    setAssignTicketId(ticketId);
    setAssignOpen(true);
  };

  const applyKpi = (id: TicketInboxKpiId) => {
    setActiveKpi(id);
    setPage(1);
    if (id === "all") {
      setStatusFilter("all");
      setPriorityFilter("all");
      setAssigneeFilter("all");
      return;
    }
    if (id === "open" || id === "in_progress" || id === "resolved" || id === "closed") {
      setStatusFilter(id);
      setPriorityFilter("all");
      setAssigneeFilter("all");
      return;
    }
    if (id === "pending") {
      setStatusFilter("waiting_customer");
      setPriorityFilter("all");
      setAssigneeFilter("all");
      return;
    }
    if (id === "unassigned") {
      setStatusFilter("all");
      setPriorityFilter("all");
      setAssigneeFilter("unassigned");
      return;
    }
  };

  const handleCreate = async () => {
    const trimmed = subject.trim();
    if (!trimmed) return;
    try {
      const result = await commands.createTicket.mutateAsync({
        subject: trimmed,
        description: description.trim() || undefined,
        priority,
        customerId: customerId !== "none" ? customerId : undefined,
      });
      setCreateOpen(false);
      setSubject("");
      setDescription("");
      setPriority("normal");
      setCustomerId("none");
      setCustomerSearch("");
      setSelectedId(result.ticket.id);
      toast({ title: t("tickets.toasts.created") });
    } catch (error) {
      toast({
        title: t("tickets.toasts.createFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  const handleAssign = async (assigneeProfileId: string) => {
    if (!assignTicketId || commands.assignTicket.isPending) return;
    const ticketId = assignTicketId;
    const employee = activeAssignees.find((row) => row.id === assigneeProfileId);
    // Close immediately so Assign never feels hung while the network/refetch runs.
    setAssignOpen(false);
    setAssignTicketId(null);
    try {
      await commands.assignTicket.mutateAsync({
        ticketId,
        assigneeUserId: assigneeProfileId,
        assigneeName: employee?.fullName,
      });
      toast({ title: t("tickets.toasts.assigned") });
    } catch (error) {
      toast({
        title: t("tickets.toasts.assignFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex min-h-0 w-full flex-col gap-5" dir={i18n.dir()}>
      <ModulePurposeBanner title={t("tickets.purposeTitle")} body={t("tickets.purposeBody")} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-[1.35rem] font-semibold tracking-tight">{t("navigation.tickets")}</h1>
          <p className="max-w-2xl text-[13px] text-muted-foreground">{t("tickets.subtitle")}</p>
        </div>
        {canCreate ? (
          <Button type="button" className="gap-2 rounded-xl" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden />
            {t("tickets.create")}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {metricsQuery.isLoading
          ? Array.from({ length: 10 }).map((_, index) => (
              <Skeleton key={index} className="h-[72px] rounded-xl" />
            ))
          : kpis.map((kpi) => (
              <button
                key={kpi.id}
                type="button"
                onClick={() => applyKpi(kpi.id)}
                className={cn(
                  "rounded-xl border px-3.5 py-3 text-start transition-colors",
                  activeKpi === kpi.id
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/60 bg-background hover:bg-muted/30",
                  kpi.id === "sla_at_risk" ||
                    kpi.id === "sla_breached" ||
                    kpi.id === "high_urgent"
                    ? "cursor-default"
                    : undefined,
                )}
                disabled={
                  kpi.id === "sla_at_risk" || kpi.id === "sla_breached" || kpi.id === "high_urgent"
                }
              >
                <p className="text-[11px] text-muted-foreground">{t(`tickets.kpis.${kpi.id}`)}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{kpi.value}</p>
              </button>
            ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("tickets.searchPlaceholder")}
            className="h-10 rounded-xl ps-9"
          />
        </div>
        <Select
          value={statusFilter ?? "all"}
          onValueChange={(value) => {
            setStatusFilter(value as TicketListFilters["status"]);
            setActiveKpi("all");
          }}
        >
          <SelectTrigger className="h-10 w-[160px] rounded-xl">
            <SelectValue placeholder={t("tickets.filter.allStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("tickets.filter.allStatus")}</SelectItem>
            {TICKET_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {t(`tickets.status.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={priorityFilter ?? "all"}
          onValueChange={(value) => {
            setPriorityFilter(value as TicketListFilters["priority"]);
            setActiveKpi("all");
          }}
        >
          <SelectTrigger className="h-10 w-[160px] rounded-xl">
            <SelectValue placeholder={t("tickets.filter.allPriority")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("tickets.filter.allPriority")}</SelectItem>
            {TICKET_PRIORITIES.map((item) => (
              <SelectItem key={item} value={item}>
                {t(`tickets.priority.${item}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={assigneeFilter}
          onValueChange={(value) => {
            setAssigneeFilter(value);
            setActiveKpi(value === "unassigned" ? "unassigned" : "all");
          }}
        >
          <SelectTrigger className="h-10 w-[180px] rounded-xl">
            <SelectValue placeholder={t("tickets.filter.allAssignees")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("tickets.filter.allAssignees")}</SelectItem>
            <SelectItem value="unassigned">{t("tickets.filter.unassigned")}</SelectItem>
            {activeAssignees.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={`${sortBy}:${sortDir}`}
          onValueChange={(value) => {
            const [nextSort, nextDir] = value.split(":") as [
              NonNullable<TicketListFilters["sortBy"]>,
              NonNullable<TicketListFilters["sortDir"]>,
            ];
            setSortBy(nextSort);
            setSortDir(nextDir);
          }}
        >
          <SelectTrigger className="h-10 w-[190px] rounded-xl">
            <SelectValue placeholder={t("tickets.sort.label")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated_at:desc">{t("tickets.sort.updatedDesc")}</SelectItem>
            <SelectItem value="updated_at:asc">{t("tickets.sort.updatedAsc")}</SelectItem>
            <SelectItem value="created_at:desc">{t("tickets.sort.createdDesc")}</SelectItem>
            <SelectItem value="created_at:asc">{t("tickets.sort.createdAsc")}</SelectItem>
            <SelectItem value="priority:desc">{t("tickets.sort.priorityDesc")}</SelectItem>
            <SelectItem value="status:asc">{t("tickets.sort.statusAsc")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {list.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      ) : (list.data?.tickets.length ?? 0) === 0 ? (
        <EnterpriseEmptyState
          icon={<Ticket className="size-6" aria-hidden />}
          title={t("tickets.emptyTitle")}
          description={t("tickets.emptyBody")}
          primaryAction={
            canCreate
              ? {
                  label: t("tickets.create"),
                  onClick: () => setCreateOpen(true),
                }
              : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-background">
          <div className="hidden grid-cols-[110px_minmax(0,1.2fr)_minmax(0,0.75fr)_120px_90px_105px_88px_minmax(0,0.7fr)_84px_110px_110px_88px] gap-2 border-b border-border/60 bg-muted/20 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground xl:grid">
            <span>{t("tickets.columns.number")}</span>
            <span>{t("tickets.columns.subject")}</span>
            <span>{t("tickets.columns.customer")}</span>
            <span>{t("tickets.columns.phone")}</span>
            <span>{t("tickets.columns.channel")}</span>
            <span>{t("tickets.columns.status")}</span>
            <span>{t("tickets.columns.priority")}</span>
            <span>{t("tickets.columns.assignee")}</span>
            <span>{t("tickets.columns.sla")}</span>
            <span>{t("tickets.createdAt")}</span>
            <span>{t("tickets.columns.updated")}</span>
            <span>{t("tickets.columns.actions")}</span>
          </div>
          <ul className="divide-y divide-border/50">
            {(list.data?.tickets ?? []).map((row) => (
              <TicketInboxRowItem
                key={row.id}
                ticket={row}
                locale={i18n.language}
                canAssign={canAssign}
                onOpen={() => setSelectedId(row.id)}
                onAssign={() => openAssign(row.id)}
                t={t}
              />
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {t("tickets.pagination.summary", {
                from: (page - 1) * PAGE_SIZE + 1,
                to: Math.min(page * PAGE_SIZE, total),
                total,
              })}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-lg"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="size-4" aria-hidden />
                {t("tickets.pagination.prev")}
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">
                {t("tickets.pagination.page", { page, totalPages })}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-lg"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                {t("tickets.pagination.next")}
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        </div>
      )}

      <Ticket360Workspace
        ticketId={selectedId}
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onOpenTicket={(ticketId) => setSelectedId(ticketId)}
        onAssignRequest={(ticketId) => openAssign(ticketId)}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("tickets.create")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="ticket-subject">{t("tickets.fields.subject")}</Label>
              <Input
                id="ticket-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ticket-customer">{t("tickets.fields.customer")}</Label>
              <Input
                id="ticket-customer-search"
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder={t("tickets.fields.customerSearch")}
                className="rounded-xl"
              />
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder={t("tickets.fields.customerPlaceholder")}>
                    {selectedCustomer
                      ? formatCustomerLabel(selectedCustomer)
                      : customerId === "none"
                        ? t("tickets.fields.noCustomer")
                        : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("tickets.fields.noCustomer")}</SelectItem>
                  {customerOptions.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {formatCustomerLabel(customer)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCustomer ? (
                <div className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-sm">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t("tickets.fields.selectedCustomer")}
                  </p>
                  <p className="mt-0.5 font-medium">{formatCustomerLabel(selectedCustomer)}</p>
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ticket-description">{t("tickets.fields.description")}</Label>
              <Textarea
                id="ticket-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-[110px] rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("tickets.columns.priority")}</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as TicketPriority)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {t(`tickets.priority.${item}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setCreateOpen(false)}>
              {t("tickets.cancel")}
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              disabled={!subject.trim() || commands.createTicket.isPending}
              onClick={() => void handleCreate()}
            >
              {t("tickets.createAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={assignOpen}
        onOpenChange={(open) => {
          if (commands.assignTicket.isPending) return;
          setAssignOpen(open);
          if (!open) setAssignTicketId(null);
        }}
      >
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("tickets.assignTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("tickets.assignHint")}</p>
          <div className="max-h-[320px] space-y-1 overflow-y-auto">
            {employees.isLoading ? (
              <div className="flex items-center justify-center gap-2 px-1 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t("tickets.assignLoading", { defaultValue: "Loading teammates…" })}
              </div>
            ) : null}
            {!employees.isLoading
              ? activeAssignees.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    disabled={commands.assignTicket.isPending}
                    className="flex w-full items-center justify-between rounded-xl border border-transparent px-3 py-2 text-start hover:border-border hover:bg-muted/40 disabled:opacity-60"
                    onClick={() => void handleAssign(row.id)}
                  >
                    <span className="text-sm font-medium">{row.fullName}</span>
                    <span className="text-xs text-muted-foreground">{row.jobTitle || row.email || ""}</span>
                  </button>
                ))
              : null}
            {!employees.isLoading && activeAssignees.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">{t("tickets.noAssignees")}</p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TicketInboxRowItem({
  ticket,
  locale,
  canAssign,
  onOpen,
  onAssign,
  t,
}: {
  ticket: TicketInboxRow;
  locale: string;
  canAssign: boolean;
  onOpen: () => void;
  onAssign: () => void;
  t: (key: string, opts?: Record<string, string>) => string;
}) {
  const customerLabel = ticket.customerName || t("tickets.360.noCustomer");
  const phoneLabel = ticket.customerPhone || "—";

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
        className={cn(
          "grid w-full cursor-pointer gap-2 px-4 py-3 text-start transition-colors hover:bg-muted/25",
          "xl:grid-cols-[110px_minmax(0,1.2fr)_minmax(0,0.75fr)_120px_90px_105px_88px_minmax(0,0.7fr)_84px_110px_110px_88px] xl:items-center xl:gap-2",
        )}
      >
        <span className="font-mono text-xs text-muted-foreground">{ticket.ticketNumber}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{ticket.subject}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground xl:hidden">
            {[ticket.customerName, ticket.customerPhone].filter(Boolean).join(" · ") ||
              t("tickets.360.noCustomer")}
          </span>
        </span>
        <span className="hidden truncate text-sm text-muted-foreground xl:block">{customerLabel}</span>
        <span className="hidden truncate font-mono text-sm text-muted-foreground xl:block" dir="ltr">
          {phoneLabel}
        </span>
        <span className="hidden text-sm text-muted-foreground xl:block">
          {ticket.channelType
            ? t(`tickets.channels.${ticket.channelType}`, { defaultValue: ticket.channelType })
            : "—"}
        </span>
        <span>
          <TicketStatusBadge status={ticket.status} label={t(`tickets.status.${ticket.status}`)} />
        </span>
        <span>
          <TicketPriorityBadge priority={ticket.priority} label={t(`tickets.priority.${ticket.priority}`)} />
        </span>
        <span className="hidden truncate text-sm text-muted-foreground xl:block">
          {ticket.assignedUserName || t("tickets.filter.unassigned")}
        </span>
        <span className="hidden xl:block">
          <TicketSlaBadge state={ticket.slaState} label={t(`tickets.sla.${ticket.slaState}`)} />
        </span>
        <span className="hidden text-xs text-muted-foreground xl:block">
          {formatTicketDateTime(ticket.createdAt, locale)}
        </span>
        <span className="hidden text-xs text-muted-foreground xl:block">
          {formatTicketDateTime(ticket.updatedAt, locale)}
        </span>
        <span className="flex items-center justify-end gap-2 text-xs text-muted-foreground xl:justify-start">
          <span className="xl:hidden">{formatTicketDateTime(ticket.updatedAt, locale)}</span>
          {canAssign ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1 rounded-lg px-2"
              onClick={(event) => {
                event.stopPropagation();
                onAssign();
              }}
            >
              <UserPlus className="size-3" aria-hidden />
              {t("tickets.assign")}
            </Button>
          ) : null}
        </span>
      </div>
    </li>
  );
}
