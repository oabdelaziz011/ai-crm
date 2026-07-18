import { Badge } from "@/components/ui/badge";

const STATUS_TONES: Record<string, string> = {
  draft: "bg-slate-500/15 text-slate-300 border-slate-500/20",
  issued: "bg-blue-500/15 text-blue-300 border-blue-500/20",
  paid: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  void: "bg-slate-500/15 text-slate-400 border-slate-500/20",
  overdue: "bg-rose-500/15 text-rose-300 border-rose-500/20",
  pending: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  processing: "bg-blue-500/15 text-blue-300 border-blue-500/20",
  succeeded: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  failed: "bg-rose-500/15 text-rose-300 border-rose-500/20",
  canceled: "bg-slate-500/15 text-slate-400 border-slate-500/20",
  refunded: "bg-violet-500/15 text-violet-300 border-violet-500/20",
};

export function BillingDocumentStatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONES[status] ?? "bg-white/5 text-muted-foreground border-white/10";
  return (
    <Badge variant="outline" className={`capitalize ${tone}`}>
      {label ?? status.replace(/_/g, " ")}
    </Badge>
  );
}
