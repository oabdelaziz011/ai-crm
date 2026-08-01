import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomersEnrichment } from "@/hooks/use-customers";

type LinkCustomerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLink: (customerId: string, customerName: string) => void;
};

export const LinkCustomerDialog = memo(function LinkCustomerDialog({
  open,
  onOpenChange,
  onLink,
}: LinkCustomerDialogProps) {
  const { t } = useTranslation("common");
  const { data: customers = [] } = useCustomersEnrichment();
  const [selectedId, setSelectedId] = useState<string>("");

  const handleSubmit = () => {
    const customer = customers.find((entry) => entry.id === selectedId);
    if (!customer) return;
    onLink(customer.id, customer.name);
    onOpenChange(false);
    setSelectedId("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("omnichannel.customer.linkCustomer")}</DialogTitle>
        </DialogHeader>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger>
            <SelectValue placeholder={t("omnichannel.customer.selectCustomer")} />
          </SelectTrigger>
          <SelectContent>
            {customers.map((customer) => (
              <SelectItem key={customer.id} value={customer.id}>
                {customer.name}
                {customer.phone ? ` · ${customer.phone}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("buttons.cancel")}
          </Button>
          <Button disabled={!selectedId} onClick={handleSubmit}>
            {t("omnichannel.customer.linkCustomer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
