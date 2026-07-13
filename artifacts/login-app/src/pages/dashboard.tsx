import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Loader2, LogOut, ShieldCheck, Users, CalendarDays,
  FileText, MessageSquare, Bot, BarChart3, Settings,
  Bell, Plus, TrendingUp, CheckCircle2, Clock,
  DollarSign, Phone, Send, Sparkles, Download,
  Filter, MoreHorizontal, ChevronRight, Star,
  AlertCircle, PieChart, Mail, User, Hash,
  ArrowUpRight, ArrowDownRight, Zap, Wifi, WifiOff,
  Pencil, Trash2, Search,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useCustomers, useDeleteCustomer, CUSTOMERS_KEY } from "@/hooks/use-customers";
import { useBookings, useDeleteBooking, BOOKINGS_KEY } from "@/hooks/use-bookings";
import { useInvoices, useDeleteInvoice, INVOICES_KEY } from "@/hooks/use-invoices";
import { CustomerModal } from "@/components/dashboard/customer-modal";
import { BookingModal } from "@/components/dashboard/booking-modal";
import { InvoiceModal } from "@/components/dashboard/invoice-modal";
import { DeleteDialog } from "@/components/dashboard/delete-dialog";
import type { Customer, Booking, Invoice } from "@/lib/types";

type Section = "customers" | "bookings" | "invoices" | "whatsapp" | "ai-chat" | "reports" | "settings";

const NAV_ITEMS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "customers",  label: "Customers",          icon: Users },
  { id: "bookings",   label: "Bookings",            icon: CalendarDays },
  { id: "invoices",   label: "Invoices",            icon: FileText },
  { id: "whatsapp",   label: "WhatsApp Automation", icon: MessageSquare },
  { id: "ai-chat",    label: "AI Chat",             icon: Bot },
  { id: "reports",    label: "Reports",             icon: BarChart3 },
  { id: "settings",   label: "Settings",            icon: Settings },
];

/* ─── helpers ──────────────────────────────────────────────── */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card/40 border border-white/5 rounded-2xl backdrop-blur-sm ${className}`}>
      {children}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, trend, trendUp, loading }: {
  label: string; value: string | number; icon: React.ElementType;
  trend?: string; trendUp?: boolean; loading?: boolean;
}) {
  return (
    <Card className="p-5 flex flex-col gap-4 hover:bg-card/60 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
          <Icon className="w-4 h-4 text-primary" />
        </div>
      </div>
      <div>
        {loading ? (
          <div className="h-7 w-16 bg-white/10 rounded animate-pulse" />
        ) : (
          <p className="text-2xl font-bold tracking-tight">{value}</p>
        )}
        {trend && !loading && (
          <p className={`text-xs mt-1 flex items-center gap-1 ${trendUp ? "text-emerald-400" : "text-rose-400"}`}>
            {trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trend}
          </p>
        )}
      </div>
    </Card>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
      <AlertCircle className="w-4 h-4 shrink-0" />
      {message}
    </div>
  );
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-white/5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center px-6 py-4 gap-4">
          <div className="w-9 h-9 rounded-full bg-white/10 animate-pulse shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-32 bg-white/10 rounded animate-pulse" />
            <div className="h-2.5 w-24 bg-white/5 rounded animate-pulse" />
          </div>
          <div className="h-5 w-16 bg-white/10 rounded-full animate-pulse" />
        </div>
      ))}
    </div>
  );
}

/* ─── CUSTOMERS ─────────────────────────────────────────────── */
function CustomersSection() {
  const { data: customers = [], isLoading, error } = useCustomers();
  const deleteCustomer = useDeleteCustomer();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; customer?: Customer | null }>({ open: false });
  const [del, setDel] = useState<Customer | null>(null);

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const pending = deleteCustomer.isPending;
  const newCount   = customers.filter(c => {
    const d = new Date(c.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage and track your customer base</p>
        </div>
        <Button onClick={() => setModal({ open: true, customer: null })} className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary gap-2">
          <Plus className="w-4 h-4" /> Add Customer
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Customers" value={customers.length}    icon={Users}         loading={isLoading} />
        <StatCard label="New This Month"  value={newCount}            icon={TrendingUp}    loading={isLoading} />
        <StatCard label="With Email"      value={customers.filter(c => c.email).length}    icon={Mail}    loading={isLoading} />
        <StatCard label="With Phone"      value={customers.filter(c => c.phone).length}    icon={Phone}   loading={isLoading} />
      </div>

      {error && <ErrorBanner message={error.message} />}

      <Card className="overflow-hidden">
        <div className="p-5 flex items-center gap-3 border-b border-white/5">
          <div className="flex-1 flex items-center gap-2 bg-black/30 border border-white/5 rounded-xl px-4 py-2.5">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search customers…"
              className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground"
            />
          </div>
          <Button variant="outline" size="sm" className="border-white/10 gap-2 shrink-0">
            <Filter className="w-3.5 h-3.5" /> Filter
          </Button>
        </div>
        {isLoading ? <TableSkeleton /> : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">
            {customers.length === 0 ? "No customers yet. Add your first one!" : "No customers match your search."}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map(c => (
              <div key={c.id} className="flex items-center px-6 py-4 hover:bg-white/[0.02] transition-colors gap-4">
                <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.email ?? c.phone ?? "—"}</p>
                </div>
                <p className="text-xs text-muted-foreground font-mono hidden md:block">
                  {format(new Date(c.created_at), "MMM dd, yyyy")}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setModal({ open: true, customer: c })}>
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setDel(c)}>
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <CustomerModal
        open={modal.open}
        onClose={() => setModal({ open: false })}
        customer={modal.customer}
      />
      <DeleteDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => del && deleteCustomer.mutate(del.id, { onSuccess: () => setDel(null) })}
        isPending={pending}
        itemName={del?.name}
      />
    </div>
  );
}

/* ─── BOOKINGS ──────────────────────────────────────────────── */
function BookingsSection() {
  const { data: bookings = [], isLoading, error } = useBookings();
  const { data: customers = [] } = useCustomers();
  const deleteBooking = useDeleteBooking();
  const [modal, setModal] = useState<{ open: boolean; booking?: Booking | null }>({ open: false });
  const [del, setDel] = useState<Booking | null>(null);

  const now = new Date();
  const today = bookings.filter(b => {
    const d = new Date(b.booking_date);
    return d.toDateString() === now.toDateString();
  });
  const pending  = bookings.filter(b => b.status === "Pending");
  const confirmed = bookings.filter(b => b.status === "Confirmed");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bookings</h1>
          <p className="text-sm text-muted-foreground mt-1">Upcoming appointments and sessions</p>
        </div>
        <Button onClick={() => setModal({ open: true, booking: null })} className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary gap-2">
          <Plus className="w-4 h-4" /> New Booking
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total"       value={bookings.length}   icon={CalendarDays} loading={isLoading} />
        <StatCard label="Today"       value={today.length}      icon={Clock}        loading={isLoading} />
        <StatCard label="Pending"     value={pending.length}    icon={AlertCircle}  loading={isLoading} />
        <StatCard label="Confirmed"   value={confirmed.length}  icon={CheckCircle2} loading={isLoading} />
      </div>

      {error && <ErrorBanner message={error.message} />}

      <Card className="overflow-hidden">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-sm">All Bookings</h3>
          <Button variant="outline" size="sm" className="border-white/10 text-xs gap-2">
            <Download className="w-3.5 h-3.5" /> Export
          </Button>
        </div>
        {isLoading ? <TableSkeleton /> : bookings.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">
            No bookings yet. Create your first one!
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {bookings.map(b => (
              <div key={b.id} className="flex items-center px-6 py-4 hover:bg-white/[0.02] transition-colors gap-4">
                <div className="hidden sm:flex flex-col items-center justify-center w-10 text-center shrink-0">
                  <span className="text-[10px] text-muted-foreground font-mono uppercase">
                    {format(new Date(b.booking_date), "MMM")}
                  </span>
                  <span className="text-lg font-bold leading-tight">
                    {format(new Date(b.booking_date), "d")}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{b.customers?.name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.service} · {format(new Date(b.booking_date), "h:mm a")}
                  </p>
                </div>
                <span className={`text-xs font-mono px-2.5 py-1 rounded-full border ${
                  b.status === "Confirmed"  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
                  b.status === "Pending"    ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
                                              "border-rose-500/30 bg-rose-500/10 text-rose-400"
                }`}>{b.status}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setModal({ open: true, booking: b })}>
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setDel(b)}>
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <BookingModal
        open={modal.open}
        onClose={() => setModal({ open: false })}
        booking={modal.booking}
        customers={customers}
      />
      <DeleteDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => del && deleteBooking.mutate(del.id, { onSuccess: () => setDel(null) })}
        isPending={deleteBooking.isPending}
        itemName={del?.service}
      />
    </div>
  );
}

/* ─── INVOICES ──────────────────────────────────────────────── */
function InvoicesSection() {
  const { data: invoices = [], isLoading, error } = useInvoices();
  const { data: customers = [] } = useCustomers();
  const deleteInvoice = useDeleteInvoice();
  const [modal, setModal] = useState<{ open: boolean; invoice?: Invoice | null }>({ open: false });
  const [del, setDel] = useState<Invoice | null>(null);

  const totalBilled   = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const totalPaid     = invoices.filter(i => i.status === "Paid").reduce((s, i) => s + Number(i.amount), 0);
  const totalUnpaid   = invoices.filter(i => i.status === "Unpaid").reduce((s, i) => s + Number(i.amount), 0);
  const totalOverdue  = invoices.filter(i => i.status === "Overdue").reduce((s, i) => s + Number(i.amount), 0);

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">Track payments and billing</p>
        </div>
        <Button onClick={() => setModal({ open: true, invoice: null })} className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary gap-2">
          <Plus className="w-4 h-4" /> New Invoice
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Billed"   value={fmt(totalBilled)}  icon={DollarSign}   loading={isLoading} />
        <StatCard label="Paid"           value={fmt(totalPaid)}    icon={CheckCircle2} loading={isLoading} />
        <StatCard label="Outstanding"    value={fmt(totalUnpaid)}  icon={Clock}        loading={isLoading} />
        <StatCard label="Overdue"        value={fmt(totalOverdue)} icon={AlertCircle}  loading={isLoading} />
      </div>

      {error && <ErrorBanner message={error.message} />}

      <Card className="overflow-hidden">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-sm">All Invoices</h3>
          <Button variant="outline" size="sm" className="border-white/10 text-xs gap-2">
            <Download className="w-3.5 h-3.5" /> Export
          </Button>
        </div>
        {isLoading ? <TableSkeleton /> : invoices.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">
            No invoices yet. Create your first one!
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {invoices.map(inv => (
              <div key={inv.id} className="flex items-center px-6 py-4 hover:bg-white/[0.02] transition-colors gap-4">
                <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{inv.customers?.name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {format(new Date(inv.invoice_date), "MMM dd, yyyy")}
                  </p>
                </div>
                <p className="text-sm font-mono font-bold">{fmt(Number(inv.amount))}</p>
                <span className={`text-xs font-mono px-2.5 py-1 rounded-full border ${
                  inv.status === "Paid"    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
                  inv.status === "Unpaid"  ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
                                             "border-rose-500/30 bg-rose-500/10 text-rose-400"
                }`}>{inv.status}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setModal({ open: true, invoice: inv })}>
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setDel(inv)}>
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <InvoiceModal
        open={modal.open}
        onClose={() => setModal({ open: false })}
        invoice={modal.invoice}
        customers={customers}
      />
      <DeleteDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => del && deleteInvoice.mutate(del.id, { onSuccess: () => setDel(null) })}
        isPending={deleteInvoice.isPending}
        itemName="invoice"
      />
    </div>
  );
}

/* ─── WHATSAPP ──────────────────────────────────────────────── */
const waFlows = [
  { name: "Welcome Message",      trigger: "New customer signup",  sent: 284, opened: 241, status: "Active" },
  { name: "Booking Reminder",     trigger: "24h before booking",   sent: 183, opened: 177, status: "Active" },
  { name: "Invoice Notification", trigger: "Invoice created",      sent: 97,  opened: 89,  status: "Active" },
  { name: "Follow-up Sequence",   trigger: "3 days post-service",  sent: 52,  opened: 41,  status: "Paused" },
  { name: "Re-engagement",        trigger: "90-day inactive",      sent: 120, opened: 68,  status: "Active" },
];

function WhatsAppSection() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">WhatsApp Automation</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage message flows and campaigns</p>
        </div>
        <Button className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary gap-2">
          <Plus className="w-4 h-4" /> New Flow
        </Button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Messages Sent"  value="736"   icon={Send}    />
        <StatCard label="Open Rate"      value="88.3%" icon={Mail}    />
        <StatCard label="Active Flows"   value="4"     icon={Zap}     />
        <StatCard label="Opt-outs"       value="12"    icon={WifiOff} />
      </div>
      <Card className="overflow-hidden">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Wifi className="w-4 h-4 text-emerald-400" />
            Automation Flows
          </h3>
          <span className="text-xs font-mono px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full">4 ACTIVE</span>
        </div>
        <div className="divide-y divide-white/5">
          {waFlows.map((f, i) => (
            <div key={i} className="px-6 py-5 hover:bg-white/[0.02] transition-colors flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="w-4 h-4 text-primary shrink-0" />
                  <p className="text-sm font-medium">{f.name}</p>
                </div>
                <p className="text-xs text-muted-foreground">Trigger: {f.trigger}</p>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <p className="font-mono font-bold">{f.sent}</p>
                  <p className="text-xs text-muted-foreground">Sent</p>
                </div>
                <div className="text-center">
                  <p className="font-mono font-bold text-emerald-400">{f.opened}</p>
                  <p className="text-xs text-muted-foreground">Opened</p>
                </div>
                <span className={`text-xs font-mono px-2.5 py-1 rounded-full border ${
                  f.status === "Active"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                }`}>{f.status}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ─── AI CHAT ───────────────────────────────────────────────── */
type ChatMsg = { role: "user" | "ai"; text: string };
const initialMessages: ChatMsg[] = [
  { role: "ai",   text: "Hi! I'm your Vault AI assistant. Ask me anything about your customers, bookings, invoices, or business insights." },
  { role: "user", text: "How many bookings do I have this week?" },
  { role: "ai",   text: "You have 18 bookings this week — 4 today, 6 tomorrow, and 8 spread across the rest of the week. 7 are still pending confirmation. Want me to send reminders?" },
];

function AiChatSection() {
  const [messages, setMessages] = useState<ChatMsg[]>(initialMessages);
  const [input, setInput] = useState("");

  const send = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setMessages(prev => [
      ...prev,
      { role: "user", text: trimmed },
      { role: "ai",   text: `I'm a demo AI \u2014 real responses will appear once the AI backend is connected. Your question was: \u201c${trimmed}\u201d` },
    ]);
    setInput("");
  };

  return (
    <div className="space-y-6 flex flex-col" style={{ minHeight: 0 }}>
      <div>
        <h1 className="text-2xl font-bold">AI Chat</h1>
        <p className="text-sm text-muted-foreground mt-1">Your intelligent business assistant</p>
      </div>
      <Card className="flex flex-col overflow-hidden" style={{ minHeight: 440 }}>
        <div className="p-5 border-b border-white/5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Vault AI</p>
            <p className="text-xs text-emerald-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> Online
            </p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                m.role === "ai" ? "bg-primary/20 border border-primary/30" : "bg-white/10 border border-white/10"
              }`}>
                {m.role === "ai" ? <Sparkles className="w-4 h-4 text-primary" /> : <User className="w-4 h-4 text-muted-foreground" />}
              </div>
              <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                m.role === "ai"
                  ? "bg-white/5 border border-white/5 text-foreground rounded-tl-sm"
                  : "bg-primary/20 border border-primary/30 text-primary rounded-tr-sm"
              }`}>
                {m.text}
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-white/5 flex gap-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send()}
            placeholder="Ask anything about your business…"
            className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/40 transition-colors"
          />
          <Button onClick={send} className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary px-4">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ─── REPORTS ───────────────────────────────────────────────── */
function ReportsSection() {
  const { data: customers = [], isLoading: cLoading } = useCustomers();
  const { data: bookings  = [], isLoading: bLoading } = useBookings();
  const { data: invoices  = [], isLoading: iLoading } = useInvoices();
  const loading = cLoading || bLoading || iLoading;

  const totalRevenue  = invoices.filter(i => i.status === "Paid").reduce((s, i) => s + Number(i.amount), 0);
  const totalBilled   = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  // Per-status breakdown for invoices
  const paid    = invoices.filter(i => i.status === "Paid").reduce((s, i) => s + Number(i.amount), 0);
  const unpaid  = invoices.filter(i => i.status === "Unpaid").reduce((s, i) => s + Number(i.amount), 0);
  const overdue = invoices.filter(i => i.status === "Overdue").reduce((s, i) => s + Number(i.amount), 0);
  const breakdown = [
    { label: "Paid",    pct: totalBilled > 0 ? Math.round(paid    / totalBilled * 100) : 0, color: "bg-emerald-400" },
    { label: "Unpaid",  pct: totalBilled > 0 ? Math.round(unpaid  / totalBilled * 100) : 0, color: "bg-amber-400" },
    { label: "Overdue", pct: totalBilled > 0 ? Math.round(overdue / totalBilled * 100) : 0, color: "bg-rose-400" },
  ];

  // Monthly booking chart (last 7 months)
  const months: string[] = [];
  const bookingCounts: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(format(d, "MMM"));
    const count = bookings.filter(b => {
      const bd = new Date(b.booking_date);
      return bd.getMonth() === d.getMonth() && bd.getFullYear() === d.getFullYear();
    }).length;
    bookingCounts.push(count);
  }
  const maxCount = Math.max(...bookingCounts, 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Business performance at a glance</p>
        </div>
        <Button variant="outline" className="border-white/10 gap-2">
          <Download className="w-4 h-4" /> Export Report
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue"   value={fmt(totalRevenue)} icon={DollarSign}   loading={loading} />
        <StatCard label="Total Customers" value={customers.length}  icon={Users}        loading={loading} />
        <StatCard label="Total Bookings"  value={bookings.length}   icon={CalendarDays} loading={loading} />
        <StatCard label="Total Invoices"  value={invoices.length}   icon={FileText}     loading={loading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> Bookings per Month
            </h3>
            <span className="text-xs text-muted-foreground font-mono">Last 7 months</span>
          </div>
          {loading ? (
            <div className="h-40 flex items-end gap-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex-1 bg-white/5 rounded-t-lg animate-pulse" style={{ height: `${30 + Math.random() * 70}%` }} />
              ))}
            </div>
          ) : (
            <div className="flex items-end gap-3 h-40">
              {bookingCounts.map((val, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground hidden sm:block">{val}</span>
                  <div
                    className="w-full rounded-t-lg transition-all"
                    style={{
                      height: `${(val / maxCount) * 120}px`,
                      minHeight: val > 0 ? 4 : 0,
                      background: i === 6
                        ? "linear-gradient(to top, hsl(190,90%,40%), hsl(190,90%,60%))"
                        : "rgba(255,255,255,0.07)",
                      border: i === 6
                        ? "1px solid hsl(190,90%,50%,0.4)"
                        : "1px solid rgba(255,255,255,0.06)",
                    }}
                  />
                  <span className="text-xs text-muted-foreground">{months[i]}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold mb-6 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-primary" /> Invoice Breakdown
          </h3>
          {loading ? (
            <div className="space-y-4">
              {[1,2,3].map(i => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3 w-24 bg-white/10 rounded animate-pulse" />
                  <div className="h-2 bg-white/5 rounded-full" />
                </div>
              ))}
            </div>
          ) : totalBilled === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No invoices yet</p>
          ) : (
            <div className="space-y-4">
              {breakdown.map(item => (
                <div key={item.label}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span>{item.label}</span>
                    <span className="font-mono text-muted-foreground">{item.pct}%</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ─── SETTINGS ──────────────────────────────────────────────── */
function SettingsSection() {
  const { user, signOut, displayName } = useAuth();
  const [, setLocation] = useLocation();

  const handleSignOut = async () => {
    await signOut();
    setLocation("/login");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account and preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-6">
            <h3 className="font-semibold mb-5 flex items-center gap-2">
              <User className="w-4 h-4 text-primary" /> Profile
            </h3>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-xl">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-medium">{displayName}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            {[
              { label: "Email",        value: user?.email ?? "—",              icon: Mail },
              { label: "User ID",      value: user?.id?.slice(0, 8) + "…",    icon: Hash },
              { label: "Joined",       value: user?.created_at ? format(new Date(user.created_at), "MMM dd, yyyy") : "—", icon: Clock },
            ].map(field => (
              <div key={field.label} className="flex items-center gap-4 p-4 bg-black/20 rounded-xl border border-white/5 mb-3 last:mb-0">
                <field.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">{field.label}</p>
                  <p className="text-sm font-medium mt-0.5 font-mono">{field.value}</p>
                </div>
              </div>
            ))}
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold mb-5 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" /> Security
            </h3>
            <div className="space-y-3">
              {[
                { label: "Change Password",  desc: "Update your login credentials" },
                { label: "Two-Factor Auth",  desc: "Add an extra layer of security" },
                { label: "Active Sessions",  desc: "View and revoke sessions" },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between p-4 bg-black/20 rounded-xl border border-white/5 hover:bg-black/30 transition-colors cursor-pointer group">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-6">
            <h3 className="font-semibold mb-5 flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" /> Notifications
            </h3>
            <div className="space-y-4">
              {[
                { label: "New Bookings",    on: true  },
                { label: "Invoice Paid",    on: true  },
                { label: "WhatsApp Alerts", on: false },
                { label: "Weekly Report",   on: true  },
                { label: "AI Insights",     on: false },
              ].map(n => (
                <div key={n.label} className="flex items-center justify-between">
                  <span className="text-sm">{n.label}</span>
                  <div className={`w-10 h-5 rounded-full border cursor-pointer transition-colors relative ${n.on ? "bg-primary/30 border-primary/50" : "bg-white/5 border-white/10"}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${n.on ? "left-5 bg-primary" : "left-0.5 bg-white/30"}`} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold mb-4 text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Account
            </h3>
            <Button
              variant="outline"
              size="sm"
              className="w-full border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs gap-2"
              onClick={handleSignOut}
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ─── ROOT DASHBOARD ────────────────────────────────────────── */
export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, displayName, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<Section>("customers");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Real badge counts from live data
  const { data: customers = [] } = useCustomers();
  const { data: bookings  = [] } = useBookings();
  const { data: invoices  = [] } = useInvoices();

  const badgeCounts: Partial<Record<Section, number>> = {
    customers: customers.length,
    bookings:  bookings.filter(b => b.status === "Pending").length,
    invoices:  invoices.filter(i => i.status === "Unpaid" || i.status === "Overdue").length,
  };

  const handleLogout = async () => {
    await signOut();
    queryClient.clear();
    setLocation("/login");
  };

  const activeNav = NAV_ITEMS.find(n => n.id === activeSection)!;

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── SIDEBAR ── */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-30 lg:z-auto
        w-64 flex-shrink-0 flex flex-col
        bg-black/60 border-r border-white/5 backdrop-blur-xl
        transition-transform duration-300 lg:translate-x-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <div className="w-9 h-9 bg-primary/10 border border-primary/30 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(0,212,255,0.2)] shrink-0">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-bold tracking-wide leading-none">Vault<span className="text-primary/80">OS</span></h2>
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5 tracking-widest uppercase">Dashboard</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const active  = activeSection === item.id;
            const badge   = badgeCounts[item.id];
            return (
              <button
                key={item.id}
                onClick={() => { setActiveSection(item.id); setSidebarOpen(false); }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                  transition-all duration-200 group relative
                  ${active
                    ? "bg-primary/15 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent"}
                `}
              >
                <item.icon className={`w-4 h-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                <span className="flex-1 text-left">{item.label}</span>
                {badge !== undefined && badge > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
                    active ? "bg-primary/30 text-primary" : "bg-white/10 text-muted-foreground"
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{displayName}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full border-white/10 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30 transition-all text-xs gap-2"
            onClick={handleLogout}
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </Button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 border-b border-white/5 bg-black/30 backdrop-blur-md flex items-center px-6 gap-4 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <Hash className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Dashboard</span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-medium text-foreground">{activeNav.label}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button className="relative p-2 rounded-lg hover:bg-white/5 transition-colors">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full" />
            </button>
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold">
              {displayName.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8 relative">
          <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage: "linear-gradient(to right,#80808012 1px,transparent 1px),linear-gradient(to bottom,#80808012 1px,transparent 1px)",
              backgroundSize: "40px 40px",
              maskImage: "radial-gradient(ellipse 60% 50% at 50% 0%,#000 70%,transparent 100%)",
            }}
          />
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative z-10 max-w-6xl mx-auto"
            >
              {activeSection === "customers" && <CustomersSection />}
              {activeSection === "bookings"  && <BookingsSection />}
              {activeSection === "invoices"  && <InvoicesSection />}
              {activeSection === "whatsapp"  && <WhatsAppSection />}
              {activeSection === "ai-chat"   && <AiChatSection />}
              {activeSection === "reports"   && <ReportsSection />}
              {activeSection === "settings"  && <SettingsSection />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
