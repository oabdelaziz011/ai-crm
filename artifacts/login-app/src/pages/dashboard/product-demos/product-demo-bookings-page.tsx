import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  useBookableProductDemoSlots,
  useCanBookProductDemos,
  useProductDemoBookings,
  useProductDemoMutations,
  useProductDemoOfferings,
} from "@/hooks/product-demos/use-product-demos";
import { useLeadsQueue } from "@/hooks/leads/use-leads-workspace";
import { useProductCatalog } from "@/hooks/products/use-product-commands";
import { useCustomers } from "@/hooks/use-customers";
import { useProfiles } from "@/hooks/use-profiles";
import { useToast } from "@/hooks/use-toast";
import { productDemoErrorMessage } from "@/lib/product-demos/product-demos-api";
import {
  DashboardCard,
  DashboardErrorBanner,
  DashboardTableSkeleton,
} from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";
const thClass = "px-4 py-3 text-start align-middle font-semibold";
const tdClass = "px-4 py-3 text-start align-middle";
const STATUSES = ["pending", "confirmed", "cancelled", "completed", "no_show"] as const;

function civilYmd(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatYmd(ymd: string, language: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1).toLocaleDateString(
    language.startsWith("ar") ? "ar-EG" : "en-GB",
    { dateStyle: "medium" },
  );
}

function formatTime(iso: string, language: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString(language.startsWith("ar") ? "ar-EG" : "en-GB", { timeStyle: "short" });
}

function formatWhen(iso: string, language: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(language.startsWith("ar") ? "ar-EG" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusLabel(t: (key: string) => string, status: string) {
  const key = `productDemos.status.${status}`;
  const label = t(key);
  return label === key ? status : label;
}

export function ProductDemoBookingsPage() {
  const { t, i18n } = useTranslation("common");
  const { toast } = useToast();
  const canBook = useCanBookProductDemos();
  const [statusFilter, setStatusFilter] = useState("");
  const [query, setQuery] = useState("");
  const [bookProductId, setBookProductId] = useState("");
  const [bookSlotId, setBookSlotId] = useState("");
  const [bookSlotDay, setBookSlotDay] = useState("");
  const [partyKind, setPartyKind] = useState<"lead" | "customer">("lead");
  const [bookLeadId, setBookLeadId] = useState("");
  const [bookCustomerId, setBookCustomerId] = useState("");
  const [partyQuery, setPartyQuery] = useState("");
  const [bookNotes, setBookNotes] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const bookingsQuery = useProductDemoBookings({
    status: statusFilter || undefined,
    query: query.trim() || undefined,
  });
  const offeringsQuery = useProductDemoOfferings();
  const productsQuery = useProductCatalog({ activeOnly: true });
  const leadsQuery = useLeadsQueue({ limit: 200 });
  const customersQuery = useCustomers(200);
  const profilesQuery = useProfiles();
  const bookableQuery = useBookableProductDemoSlots(bookProductId || null);
  const mutations = useProductDemoMutations();

  const products = productsQuery.data?.items ?? [];
  const productNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of products) map.set(product.id, product.name);
    for (const offering of offeringsQuery.data?.items ?? []) {
      if (!map.has(offering.catalogProductId)) map.set(offering.catalogProductId, offering.title);
    }
    return map;
  }, [products, offeringsQuery.data]);

  const profileLabel = (userId: string) => {
    const profiles = profilesQuery.data ?? [];
    const match = profiles.find((profile) => profile.user_id === userId || profile.id === userId);
    return match?.full_name || match?.email || userId.slice(0, 8);
  };

  const bookings = bookingsQuery.data?.items ?? [];
  const bookable = bookableQuery.data?.items ?? [];
  const leads = leadsQuery.data?.rows ?? [];
  const customers = customersQuery.data ?? [];
  const partySearch = partyQuery.trim().toLowerCase();
  const leadOptions = leads.filter((lead) => {
    if (!partySearch) return true;
    return `${lead.name} ${lead.phone ?? ""} ${lead.email ?? ""}`.toLowerCase().includes(partySearch);
  });
  const customerOptions = customers.filter((customer) => {
    if (!partySearch) return true;
    return `${customer.name} ${customer.phone ?? ""} ${customer.email ?? ""}`.toLowerCase().includes(partySearch);
  });
  const leadNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const lead of leads) map.set(lead.id, lead.name);
    return map;
  }, [leads]);
  const customerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const customer of customers) map.set(customer.id, customer.name);
    return map;
  }, [customers]);
  const bookableDays = useMemo(() => {
    const groups = new Map<string, typeof bookable>();
    for (const slot of bookable) {
      const ymd = civilYmd(slot.startAt);
      const list = groups.get(ymd) ?? [];
      list.push(slot);
      groups.set(ymd, list);
    }
    return [...groups.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([ymd, items]) => [ymd, [...items].sort((left, right) => left.startAt.localeCompare(right.startAt))] as const);
  }, [bookable]);
  const daySlots = bookableDays.find(([ymd]) => ymd === bookSlotDay)?.[1] ?? [];
  const busy = mutations.confirmBooking.isPending || mutations.cancelBooking.isPending;
  const hasIdentity = Boolean(bookLeadId.trim() || bookCustomerId.trim());

  if (bookingsQuery.isLoading) return <DashboardTableSkeleton rows={6} />;
  if (bookingsQuery.error) {
    return (
      <DashboardErrorBanner message={productDemoErrorMessage(bookingsQuery.error, t)}>
        <div className="mt-3">
          <Button type="button" size="sm" variant="outline" onClick={() => void bookingsQuery.refetch()}>
            {t("productDemos.retry")}
          </Button>
        </div>
      </DashboardErrorBanner>
    );
  }

  return (
    <div className="space-y-6 [&_table]:border-collapse">
      {notice ? (
        <p
          className={`rounded-xl border px-3 py-2 text-sm ${
            notice.tone === "err"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
          }`}
          role="status"
        >
          {notice.text}
        </p>
      ) : null}

      {!canBook ? <p className="text-sm text-muted-foreground">{t("productDemos.bookDenied")}</p> : null}

      {canBook ? (
        <DashboardCard className="space-y-4 p-4">
          <h2 className="text-sm font-semibold">{t("productDemos.bookings.bookTitle")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="pdb-product">{t("productDemos.bookings.product")}</Label>
              <select
                id="pdb-product"
                className={selectClass}
                value={bookProductId}
                onChange={(event) => {
                  setBookProductId(event.target.value);
                  setBookSlotId("");
                  setBookSlotDay("");
                }}
              >
                <option value="">{t("productDemos.bookings.selectProduct")}</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pdb-day">{t("productDemos.bookings.slotDay")}</Label>
              <select
                id="pdb-day"
                className={selectClass}
                value={bookSlotDay}
                disabled={!bookProductId || bookableQuery.isLoading}
                onChange={(event) => {
                  setBookSlotDay(event.target.value);
                  setBookSlotId("");
                }}
              >
                <option value="">
                  {bookableQuery.isLoading
                    ? t("productDemos.bookings.loadingSlots")
                    : t("productDemos.bookings.selectSlotDay")}
                </option>
                {bookableDays.map(([ymd, items]) => (
                  <option key={ymd} value={ymd}>
                    {formatYmd(ymd, i18n.language)} ({items.length})
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{t("productDemos.bookings.slotDayHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pdb-slot">{t("productDemos.bookings.slot")}</Label>
              <select
                id="pdb-slot"
                className={selectClass}
                value={bookSlotId}
                onChange={(event) => setBookSlotId(event.target.value)}
                disabled={!bookSlotDay || bookableQuery.isLoading}
              >
                <option value="">{t("productDemos.bookings.selectSlot")}</option>
                {daySlots.map((slot) => (
                  <option key={slot.slotId} value={slot.slotId}>
                    {formatTime(slot.startAt, i18n.language)} · {profileLabel(slot.presenterUserId)} ·{" "}
                    {t("productDemos.bookings.remaining", { count: slot.remainingCapacity })}
                  </option>
                ))}
              </select>
              {bookProductId && !bookableQuery.isLoading && bookable.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("productDemos.noPublishedSlots")}</p>
              ) : null}
            </div>
            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <p className="text-sm font-semibold">{t("productDemos.bookings.whoTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("productDemos.bookings.whoHelp")}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={partyKind === "lead" ? "default" : "outline"}
                  onClick={() => {
                    setPartyKind("lead");
                    setBookCustomerId("");
                    setPartyQuery("");
                  }}
                >
                  {t("productDemos.bookings.partyLead")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={partyKind === "customer" ? "default" : "outline"}
                  onClick={() => {
                    setPartyKind("customer");
                    setBookLeadId("");
                    setPartyQuery("");
                  }}
                >
                  {t("productDemos.bookings.partyCustomer")}
                </Button>
              </div>
              <Input
                value={partyQuery}
                onChange={(event) => setPartyQuery(event.target.value)}
                placeholder={t("productDemos.bookings.searchParty")}
              />
              {partyKind === "lead" ? (
                <>
                  <Label htmlFor="pdb-lead">{t("productDemos.bookings.partyLead")}</Label>
                  <select
                    id="pdb-lead"
                    className={selectClass}
                    value={bookLeadId}
                    onChange={(event) => setBookLeadId(event.target.value)}
                  >
                    <option value="">{t("productDemos.bookings.selectLead")}</option>
                    {leadOptions.map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {lead.name}
                        {lead.phone ? ` · ${lead.phone}` : ""}
                      </option>
                    ))}
                  </select>
                  {leadOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("productDemos.bookings.noLeads")}</p>
                  ) : null}
                </>
              ) : (
                <>
                  <Label htmlFor="pdb-customer">{t("productDemos.bookings.partyCustomer")}</Label>
                  <select
                    id="pdb-customer"
                    className={selectClass}
                    value={bookCustomerId}
                    onChange={(event) => setBookCustomerId(event.target.value)}
                  >
                    <option value="">{t("productDemos.bookings.selectCustomer")}</option>
                    {customerOptions.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                        {customer.phone ? ` · ${customer.phone}` : ""}
                      </option>
                    ))}
                  </select>
                  {customerOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("productDemos.bookings.noCustomers")}</p>
                  ) : null}
                </>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pdb-notes">{t("productDemos.bookings.notes")}</Label>
              <Input id="pdb-notes" value={bookNotes} onChange={(event) => setBookNotes(event.target.value)} />
            </div>
          </div>
          <Button
            type="button"
            disabled={busy || !bookSlotId || !hasIdentity}
            onClick={() => {
              if (!hasIdentity) {
                setNotice({ tone: "err", text: t("productDemos.needIdentity") });
                return;
              }
              void mutations.confirmBooking
                .mutateAsync({
                  slotId: bookSlotId,
                  leadId: bookLeadId.trim() || null,
                  customerId: bookCustomerId.trim() || null,
                  notes: bookNotes.trim() || null,
                })
                .then(() => {
                  const text = t("productDemos.bookings.confirmed");
                  setNotice({ tone: "ok", text });
                  toast({ title: text });
                  setBookSlotId("");
                  setBookNotes("");
                })
                .catch((error) => {
                  const text = productDemoErrorMessage(error, t);
                  setNotice({ tone: "err", text });
                  toast({
                    title: t("productDemos.bookings.failed"),
                    description: text,
                    variant: "destructive",
                  });
                });
            }}
          >
            {mutations.confirmBooking.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("productDemos.bookings.confirm")
            )}
          </Button>
          {!hasIdentity ? (
            <p className="text-xs text-muted-foreground">{t("productDemos.needIdentity")}</p>
          ) : null}
        </DashboardCard>
      ) : null}

      <DashboardCard className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pdb-status">{t("productDemos.bookings.status")}</Label>
            <select
              id="pdb-status"
              className={selectClass}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">{t("productDemos.bookings.all")}</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(t, status)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pdb-query">{t("productDemos.bookings.search")}</Label>
            <Input
              id="pdb-query"
              className="w-56"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("productDemos.bookings.searchPlaceholder")}
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void bookingsQuery.refetch()}>
            {t("productDemos.bookings.refresh")}
          </Button>
        </div>

        {bookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("productDemos.noBookings")}</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/40 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-start text-[13px]">
                <thead className="border-b border-border/40 bg-muted/20 text-[11px] font-semibold text-muted-foreground">
                  <tr>
                    <th className={thClass}>{t("productDemos.bookings.columns.product")}</th>
                    <th className={thClass}>{t("productDemos.bookings.columns.party")}</th>
                    <th className={thClass}>{t("productDemos.bookings.columns.presenter")}</th>
                    <th className={thClass}>{t("productDemos.bookings.columns.time")}</th>
                    <th className={thClass}>{t("productDemos.bookings.columns.status")}</th>
                    <th className={thClass}>{t("productDemos.bookings.columns.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => {
                    const canCancel =
                      canBook && booking.status !== "cancelled" && booking.status !== "completed";
                    return (
                      <tr key={booking.id} className="border-b border-border/30 last:border-0">
                        <td className={tdClass}>
                          {productNameById.get(booking.catalogProductId) ??
                            booking.catalogProductId.slice(0, 8)}
                        </td>
                        <td className={`${tdClass} text-muted-foreground`}>
                          {booking.customerId
                            ? (customerNameById.get(booking.customerId) ??
                              t("productDemos.bookings.customer", { id: booking.customerId.slice(0, 8) }))
                            : booking.leadId
                              ? (leadNameById.get(booking.leadId) ??
                                t("productDemos.bookings.lead", { id: booking.leadId.slice(0, 8) }))
                              : "—"}
                        </td>
                        <td className={tdClass}>{profileLabel(booking.presenterUserId)}</td>
                        <td className={tdClass}>{formatWhen(booking.startAt, i18n.language)}</td>
                        <td className={tdClass}>{statusLabel(t, booking.status)}</td>
                        <td className={tdClass}>
                          {canCancel ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              disabled={busy}
                              onClick={() => {
                                void mutations.cancelBooking
                                  .mutateAsync({ bookingId: booking.id })
                                  .then(() => {
                                    const text = t("productDemos.bookings.cancelled");
                                    setNotice({ tone: "ok", text });
                                    toast({ title: text });
                                  })
                                  .catch((error) => {
                                    const text = productDemoErrorMessage(error, t);
                                    setNotice({ tone: "err", text });
                                    toast({
                                      title: t("productDemos.bookings.cancelFailed"),
                                      description: text,
                                      variant: "destructive",
                                    });
                                  });
                              }}
                            >
                              {t("productDemos.bookings.cancel")}
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">{t("productDemos.bookings.noAction")}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
