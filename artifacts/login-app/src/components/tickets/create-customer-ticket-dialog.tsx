import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TICKET_PRIORITIES, type TicketPriority } from "@workspace/ticket-platform";
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
import { Textarea } from "@/components/ui/textarea";
import { useTicketCommands } from "@/hooks/tickets/use-tickets";
import { useToast } from "@/hooks/use-toast";

export function CreateCustomerTicketDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName?: string | null;
  onCreated?: (ticketId: string) => void;
}) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const commands = useTicketCommands();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normal");

  const reset = () => {
    setSubject("");
    setDescription("");
    setPriority("normal");
  };

  const handleCreate = async () => {
    const trimmed = subject.trim();
    if (!trimmed) return;
    try {
      const result = await commands.createTicket.mutateAsync({
        subject: trimmed,
        description: description.trim() || undefined,
        priority,
        customerId,
      });
      reset();
      onOpenChange(false);
      onCreated?.(result.ticket.id);
      toast({ title: t("tickets.toasts.created") });
    } catch (error) {
      toast({
        title: t("tickets.toasts.createFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("tickets.create")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-xl border border-border/50 px-3 py-2 text-sm">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("tickets.fields.customer")}
            </p>
            <p className="mt-0.5 font-medium">{customerName || customerId}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-ticket-subject">{t("tickets.fields.subject")}</Label>
            <Input
              id="customer-ticket-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-ticket-description">{t("tickets.fields.description")}</Label>
            <Textarea
              id="customer-ticket-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-[100px] rounded-xl"
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
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
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
  );
}
