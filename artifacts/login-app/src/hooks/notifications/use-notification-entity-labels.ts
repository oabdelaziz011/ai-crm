import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseNotificationPayload, type NotificationEntityLabels } from "@/lib/notification-i18n";
import { supabase } from "@/lib/supabase";
import type { Notification } from "@/lib/notifications/types";

function formatMoneyLabel(cents: unknown, currency: unknown): string {
  const amount = Number(cents);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  const code = String(currency || "USD").trim().toUpperCase() || "USD";
  return `${(amount / 100).toFixed(2)} ${code}`;
}

function collectIds(notifications: Notification[]) {
  const customerIds = new Set<string>();
  const invoiceIds = new Set<string>();
  const bookingIds = new Set<string>();
  const paymentIds = new Set<string>();

  for (const notification of notifications) {
    const { params, messageKey } = parseNotificationPayload(notification.messagePayload);
    if (!params) continue;
    const customerId = (params.customerId || params.customer_id || "").trim();
    const invoiceId = (params.invoiceId || params.invoice_id || "").trim();
    const bookingId = (params.bookingId || params.booking_id || "").trim();
    const paymentId = (params.paymentId || params.payment_id || "").trim();
    const entityId = (params.entityId || "").trim();
    const entityType = (params.entityType || "").trim();
    const navInvoiceId = params.navigationTarget?.match(/invoiceId=([^&]+)/i)?.[1];
    const isPayment =
      notification.event === "payment_received" ||
      notification.category === "payment" ||
      notification.category === "invoice" ||
      Boolean(messageKey?.includes("paymentReceived")) ||
      Boolean(messageKey?.includes("invoicePaid")) ||
      Boolean(messageKey?.includes("invoiceCreated")) ||
      entityType === "payment" ||
      entityType === "invoice";

    if (customerId) customerIds.add(customerId);
    if (entityType === "customer" && entityId) customerIds.add(entityId);
    if (invoiceId) invoiceIds.add(invoiceId);
    if (navInvoiceId) invoiceIds.add(decodeURIComponent(navInvoiceId));
    if (entityType === "invoice" && entityId) invoiceIds.add(entityId);
    if (bookingId) bookingIds.add(bookingId);
    if (entityType === "booking" && entityId) bookingIds.add(entityId);
    if (notification.event?.includes("appointment") || notification.category === "booking") {
      if (entityId) bookingIds.add(entityId);
    }
    if (paymentId) paymentIds.add(paymentId);
    if (entityType === "payment" && entityId) paymentIds.add(entityId);
    if (isPayment && entityId) {
      invoiceIds.add(entityId);
      paymentIds.add(entityId);
    }
    if (isPayment && invoiceId) paymentIds.add(invoiceId);
  }

  return {
    customerIds: [...customerIds],
    invoiceIds: [...invoiceIds],
    bookingIds: [...bookingIds],
    paymentIds: [...paymentIds],
  };
}

/** Batch-load customer/invoice/payment labels so notifications show real details. */
export function useNotificationEntityLabels(
  companyId: string | null | undefined,
  notifications: Notification[],
): NotificationEntityLabels {
  const { customerIds, invoiceIds, bookingIds, paymentIds } = useMemo(
    () => collectIds(notifications),
    [notifications],
  );

  const bookingsQuery = useQuery({
    queryKey: ["notification-entity-labels", "bookings", companyId, bookingIds.join(",")],
    enabled: Boolean(companyId) && bookingIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduling_bookings")
        .select("id, customer_id")
        .eq("company_id", companyId!)
        .in("id", bookingIds);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        bookingId: String(row.id),
        customerId: row.customer_id ? String(row.customer_id) : "",
      }));
    },
  });

  const invoicesQuery = useQuery({
    queryKey: ["notification-entity-labels", "invoices", companyId, invoiceIds.join(",")],
    enabled: Boolean(companyId) && invoiceIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, customer_id, total_cents, paid_cents, currency")
        .eq("company_id", companyId!)
        .in("id", invoiceIds);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        invoiceId: String(row.id),
        invoiceNumber: String(row.invoice_number ?? row.id.slice(0, 8)),
        customerId: row.customer_id ? String(row.customer_id) : "",
        amount:
          formatMoneyLabel(row.paid_cents, row.currency) ||
          formatMoneyLabel(row.total_cents, row.currency),
      }));
    },
  });

  const paymentsQuery = useQuery({
    queryKey: ["notification-entity-labels", "payments", companyId, paymentIds.join(",")],
    enabled: Boolean(companyId) && paymentIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_payments")
        .select("id, invoice_id, customer_id, amount_cents, currency")
        .eq("company_id", companyId!)
        .in("id", paymentIds);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        paymentId: String(row.id),
        invoiceId: row.invoice_id ? String(row.invoice_id) : "",
        customerId: row.customer_id ? String(row.customer_id) : "",
        amount: formatMoneyLabel(row.amount_cents, row.currency),
      }));
    },
  });

  const linkedInvoiceIds = useMemo(() => {
    const set = new Set(invoiceIds);
    for (const row of paymentsQuery.data ?? []) {
      if (row.invoiceId) set.add(row.invoiceId);
    }
    return [...set];
  }, [invoiceIds, paymentsQuery.data]);

  const linkedInvoicesQuery = useQuery({
    queryKey: ["notification-entity-labels", "invoices-linked", companyId, linkedInvoiceIds.join(",")],
    enabled: Boolean(companyId) && linkedInvoiceIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, customer_id, total_cents, paid_cents, currency")
        .eq("company_id", companyId!)
        .in("id", linkedInvoiceIds);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        invoiceId: String(row.id),
        invoiceNumber: String(row.invoice_number ?? row.id.slice(0, 8)),
        customerId: row.customer_id ? String(row.customer_id) : "",
        amount:
          formatMoneyLabel(row.paid_cents, row.currency) ||
          formatMoneyLabel(row.total_cents, row.currency),
      }));
    },
  });

  const allCustomerIds = useMemo(() => {
    const set = new Set(customerIds);
    for (const row of bookingsQuery.data ?? []) {
      if (row.customerId) set.add(row.customerId);
    }
    for (const row of invoicesQuery.data ?? []) {
      if (row.customerId) set.add(row.customerId);
    }
    for (const row of linkedInvoicesQuery.data ?? []) {
      if (row.customerId) set.add(row.customerId);
    }
    for (const row of paymentsQuery.data ?? []) {
      if (row.customerId) set.add(row.customerId);
    }
    return [...set];
  }, [
    bookingsQuery.data,
    customerIds,
    invoicesQuery.data,
    linkedInvoicesQuery.data,
    paymentsQuery.data,
  ]);

  const customersQuery = useQuery({
    queryKey: ["notification-entity-labels", "customers", companyId, allCustomerIds.join(",")],
    enabled: Boolean(companyId) && allCustomerIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name")
        .eq("company_id", companyId!)
        .in("id", allCustomerIds);
      if (error) throw new Error(error.message);
      return Object.fromEntries((data ?? []).map((row) => [String(row.id), String(row.name ?? "")]));
    },
  });

  return useMemo(() => {
    const customerNameById = customersQuery.data ?? {};
    const invoiceNumberById: Record<string, string> = {};
    const amountByInvoiceId: Record<string, string> = {};
    const amountByPaymentId: Record<string, string> = {};
    const customerNameByInvoiceId: Record<string, string> = {};
    const customerNameByBookingId: Record<string, string> = {};
    const customerNameByPaymentId: Record<string, string> = {};
    const invoiceIdByPaymentId: Record<string, string> = {};

    const invoiceRows = linkedInvoicesQuery.data?.length
      ? linkedInvoicesQuery.data
      : (invoicesQuery.data ?? []);

    for (const row of invoiceRows) {
      invoiceNumberById[row.invoiceId] = row.invoiceNumber;
      if (row.amount) amountByInvoiceId[row.invoiceId] = row.amount;
      if (row.customerId && customerNameById[row.customerId]) {
        customerNameByInvoiceId[row.invoiceId] = customerNameById[row.customerId];
      }
    }
    for (const row of bookingsQuery.data ?? []) {
      if (row.customerId && customerNameById[row.customerId]) {
        customerNameByBookingId[row.bookingId] = customerNameById[row.customerId];
      }
    }
    for (const row of paymentsQuery.data ?? []) {
      if (row.amount) amountByPaymentId[row.paymentId] = row.amount;
      if (row.invoiceId) invoiceIdByPaymentId[row.paymentId] = row.invoiceId;
      if (row.customerId && customerNameById[row.customerId]) {
        customerNameByPaymentId[row.paymentId] = customerNameById[row.customerId];
      }
    }

    return {
      customerNameById,
      invoiceNumberById,
      customerNameByInvoiceId,
      customerNameByBookingId,
      customerNameByPaymentId,
      amountByInvoiceId,
      amountByPaymentId,
      invoiceIdByPaymentId,
    };
  }, [
    bookingsQuery.data,
    customersQuery.data,
    invoicesQuery.data,
    linkedInvoicesQuery.data,
    paymentsQuery.data,
  ]);
}
