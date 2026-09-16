import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  CAMPAIGN_PICKER_CHANNEL_COLUMNS,
  customerHasPickerChannel,
  type CampaignMessagingPresence,
  type CampaignPickerChannelColumn,
} from "@/lib/campaigns/campaign-customer-channel-availability";
import { formatCampaignPickerPhone } from "@/lib/campaigns/campaign-content";
import { cn } from "@/lib/utils";
import type { Customer } from "@/lib/types";

const EMPTY_PRESENCE: CampaignMessagingPresence = new Map();

const AUDIENCE_GRID =
  "grid min-w-[56rem] items-center gap-x-3 [grid-template-columns:2.5rem_minmax(9rem,1.25fr)_minmax(9rem,0.9fr)_minmax(13rem,1.45fr)_repeat(5,3.5rem)]";

type Props = {
  customers: Customer[];
  selectedIds: string[];
  onToggle: (customerId: string) => void;
  onToggleAll: (customerIds: string[]) => void;
  messagingPresence?: CampaignMessagingPresence;
  presenceLoading?: boolean;
};

function channelHeaderKey(channel: CampaignPickerChannelColumn): string {
  switch (channel) {
    case "whatsapp":
      return "campaigns.wizard.audience.table.whatsapp";
    case "instagram":
      return "campaigns.wizard.audience.table.instagram";
    case "messenger":
      return "campaigns.wizard.audience.table.messenger";
    case "email":
      return "campaigns.wizard.audience.table.emailChannel";
    case "sms":
      return "campaigns.wizard.audience.table.sms";
  }
}

function displayEmail(customer: Customer): string {
  return (customer.email ?? "").trim();
}

/** Keep LTR numbers/emails under RTL headers (right in Arabic, left in English). */
function IdentityValue({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <span className={cn("block truncate text-start", className)} title={value || undefined}>
      {value ? <bdi dir="ltr">{value}</bdi> : "—"}
    </span>
  );
}

function ChannelMark({ available, label }: { available: boolean; label: string }) {
  return (
    <span className="flex justify-center" aria-label={label}>
      {available ? (
        <Check
          className="size-4 text-emerald-600"
          aria-hidden
          data-testid="campaign-picker-channel-available"
        />
      ) : (
        <span className="text-muted-foreground/40" aria-hidden>
          —
        </span>
      )}
    </span>
  );
}

export function CampaignManualAudienceTable({
  customers,
  selectedIds,
  onToggle,
  onToggleAll,
  messagingPresence = EMPTY_PRESENCE,
  presenceLoading = false,
}: Props) {
  const { t } = useTranslation("common");
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const ordered = useMemo(() => {
    return [...customers].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [customers]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return ordered;
    return ordered.filter((customer) => {
      const haystack = [
        customer.name,
        formatCampaignPickerPhone(customer),
        customer.phone ?? "",
        customer.phone_e164 ?? "",
        displayEmail(customer),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [ordered, query]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((customer) => selected.has(customer.id));
  const someFilteredSelected = filtered.some((customer) => selected.has(customer.id));

  return (
    <div className="space-y-2" data-testid="campaign-manual-audience-table">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("campaigns.wizard.audience.table.search")}
          className="max-w-sm"
          data-testid="campaign-manual-audience-search"
        />
        <p className="text-xs text-muted-foreground">
          {t("campaigns.wizard.audience.table.selectedCount", { count: selectedIds.length })}
        </p>
      </div>
      <div className="max-h-[min(22rem,42vh)] overflow-auto rounded-md border">
        <div
          role="table"
          className={cn("w-full text-sm")}
          data-testid="campaign-manual-audience-grid"
        >
          <div
            role="row"
            className={cn(
              AUDIENCE_GRID,
              "sticky top-0 z-10 border-b bg-background px-2 py-2 text-xs font-medium text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]",
            )}
          >
            <div role="columnheader">
              <Checkbox
                checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                onCheckedChange={() => onToggleAll(filtered.map((customer) => customer.id))}
                aria-label={t("campaigns.wizard.audience.table.selectAll")}
                data-testid="campaign-manual-select-all"
              />
            </div>
            <div role="columnheader" className="min-w-0 text-start">
              {t("campaigns.wizard.audience.table.name")}
            </div>
            <div role="columnheader" className="min-w-0 text-start">
              {t("campaigns.wizard.audience.table.phone")}
            </div>
            <div role="columnheader" className="min-w-0 text-start">
              {t("campaigns.wizard.audience.table.email")}
            </div>
            {CAMPAIGN_PICKER_CHANNEL_COLUMNS.map((channel) => (
              <div key={channel} role="columnheader" className="text-center whitespace-nowrap">
                {t(channelHeaderKey(channel))}
              </div>
            ))}
          </div>
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-muted-foreground">
              {t("campaigns.wizard.audience.table.empty")}
            </div>
          ) : (
            filtered.map((customer) => {
              const phone = formatCampaignPickerPhone(customer);
              const email = displayEmail(customer);
              return (
                <div
                  key={customer.id}
                  role="row"
                  data-state={selected.has(customer.id) ? "selected" : undefined}
                  className={cn(
                    AUDIENCE_GRID,
                    "cursor-pointer border-b px-2 py-2 last:border-b-0 hover:bg-muted/40 data-[state=selected]:bg-muted/50",
                  )}
                  onClick={() => onToggle(customer.id)}
                >
                  <div role="cell" onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(customer.id)}
                      onCheckedChange={() => onToggle(customer.id)}
                      aria-label={customer.name}
                    />
                  </div>
                  <div role="cell" className="min-w-0 overflow-hidden">
                    <IdentityValue value={customer.name} className="font-medium" />
                  </div>
                  <div role="cell" className="min-w-0 overflow-hidden">
                    <IdentityValue
                      value={phone}
                      className="font-mono text-xs tabular-nums text-muted-foreground"
                    />
                  </div>
                  <div role="cell" className="min-w-0 overflow-hidden">
                    <IdentityValue value={email} className="text-xs text-muted-foreground" />
                  </div>
                  {CAMPAIGN_PICKER_CHANNEL_COLUMNS.map((channel) => {
                    const waitingOnPresence =
                      presenceLoading && (channel === "instagram" || channel === "messenger");
                    const available = waitingOnPresence
                      ? false
                      : customerHasPickerChannel({
                          customer,
                          customerId: customer.id,
                          channel,
                          messagingPresence,
                        });
                    return (
                      <div
                        key={channel}
                        role="cell"
                        className="text-center"
                        data-testid={`campaign-picker-${channel}-${
                          waitingOnPresence ? "pending" : available ? "yes" : "no"
                        }`}
                      >
                        {waitingOnPresence ? (
                          <span
                            className="mx-auto block size-3 animate-pulse rounded-full bg-muted"
                            aria-hidden
                          />
                        ) : (
                          <ChannelMark
                            available={available}
                            label={`${t(channelHeaderKey(channel))}: ${
                              available
                                ? t("campaigns.wizard.audience.table.available")
                                : t("campaigns.wizard.audience.table.unavailable")
                            }`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
