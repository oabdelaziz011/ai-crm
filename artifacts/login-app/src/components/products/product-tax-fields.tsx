import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBillingCurrency } from "@/lib/billing/format";
import {
  computeProductTaxBreakdown,
  type ProductPriceTaxMode,
} from "@workspace/product-platform";

export function ProductTaxFields({
  enteredPrice,
  currency,
  taxMode,
  taxPercent,
  onTaxModeChange,
  onTaxPercentChange,
}: {
  enteredPrice: string;
  currency: string;
  taxMode: ProductPriceTaxMode;
  taxPercent: string;
  onTaxModeChange: (value: ProductPriceTaxMode) => void;
  onTaxPercentChange: (value: string) => void;
}) {
  const { t } = useTranslation("common");
  const price = Number(enteredPrice);
  const percent = taxPercent.trim() === "" ? 0 : Number(taxPercent);
  const breakdown = computeProductTaxBreakdown({
    enteredPrice: Number.isFinite(price) ? price : 0,
    taxMode,
    taxPercent: Number.isFinite(percent) ? percent : 0,
  });
  const showPreview = Number.isFinite(price) && price > 0;

  return (
    <>
      <div>
        <Label>{t("products.fields.priceTaxMode")}</Label>
        <Select value={taxMode} onValueChange={(value) => onTaxModeChange(value as ProductPriceTaxMode)}>
          <SelectTrigger className="mt-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inclusive">{t("products.tax.inclusive")}</SelectItem>
            <SelectItem value="exclusive">{t("products.tax.exclusive")}</SelectItem>
            <SelectItem value="unspecified">{t("products.tax.unspecified")}</SelectItem>
          </SelectContent>
        </Select>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {taxMode === "unspecified" ? t("products.hints.priceTaxModeUnspecified") : t("products.hints.priceTaxMode")}
        </p>
      </div>
      <div>
        <Label htmlFor="product-tax-percent">{t("products.fields.taxPercent")}</Label>
        <div className="relative mt-1.5">
          <Input
            id="product-tax-percent"
            type="number"
            min={0}
            max={100}
            step="0.001"
            value={taxPercent}
            onChange={(event) => onTaxPercentChange(event.target.value)}
            placeholder="0"
            className="pe-8"
          />
          <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-[12px] text-muted-foreground">
            %
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{t("products.hints.taxPercent")}</p>
      </div>
      {showPreview ? (
        <div className="sm:col-span-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("products.tax.internalBreakdown")}
          </p>
          <dl className="mt-2 grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-[11px] text-muted-foreground">{t("products.tax.net")}</dt>
              <dd className="mt-0.5 text-[13px] font-medium tabular-nums">
                {formatBillingCurrency(breakdown.net, currency)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">{t("products.tax.amount")}</dt>
              <dd className="mt-0.5 text-[13px] font-medium tabular-nums">
                {formatBillingCurrency(breakdown.taxAmount, currency)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">{t("products.tax.customerTotal")}</dt>
              <dd className="mt-0.5 text-[14px] font-semibold tabular-nums">
                {formatBillingCurrency(breakdown.gross, currency)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-muted-foreground">{t("products.tax.customerHint")}</p>
        </div>
      ) : null}
    </>
  );
}
