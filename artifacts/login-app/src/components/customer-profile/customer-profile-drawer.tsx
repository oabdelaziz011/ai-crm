import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DashboardErrorBanner } from "@/components/dashboard/ui";
import { useCustomer, useCustomerRealtime } from "@/hooks/use-customer";
import { useHasPermission } from "@/hooks/use-rbac";
import { OverviewTab } from "@/components/customer-profile/tabs/overview-tab";
import { TimelineTab } from "@/components/customer-profile/tabs/timeline-tab";
import { NotesTab } from "@/components/customer-profile/tabs/notes-tab";
import { SystemTab } from "@/components/customer-profile/tabs/system-tab";
import { ProfilePlaceholderTab } from "@/components/customer-profile/tabs/profile-placeholder-tab";
import type {
  CustomerProfileDrawerProps,
  CustomerProfileTab,
} from "@/components/customer-profile/types";
import { CUSTOMER_PROFILE_TABS } from "@/components/customer-profile/types";

export function CustomerProfileDrawer({
  open,
  onClose,
  customerId,
  defaultTab = "overview",
  context,
  onQuickAction,
  isQuickActionPending,
}: CustomerProfileDrawerProps) {
  const { t } = useTranslation("common");
  const canEdit = useHasPermission("customers.edit");
  const { data: customer, isLoading, error, refetch } = useCustomer(open ? customerId : null);
  const [activeTab, setActiveTab] = useState<CustomerProfileTab>(defaultTab);
  const [notesAutoFocus, setNotesAutoFocus] = useState(false);

  useCustomerRealtime(open ? customerId : null);

  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
      setNotesAutoFocus(defaultTab === "notes");
    }
  }, [open, defaultTab, customerId]);

  useEffect(() => {
    if (open && customerId) {
      void refetch();
    }
  }, [open, customerId, refetch]);

  const tabLabel = (tab: CustomerProfileTab) =>
    t(`dashboard.customerProfile.tabs.${tab}`);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl lg:max-w-2xl p-0 gap-0 flex flex-col border-white/10 bg-card"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{t("dashboard.customerProfile.title")}</SheetTitle>
          <SheetDescription>{t("dashboard.customerProfile.subtitle")}</SheetDescription>
        </SheetHeader>

        {!customerId ? (
          <div className="p-6">
            <p className="text-sm text-muted-foreground py-6 text-center">
              {t("dashboard.customerDetails.notLinked")}
            </p>
          </div>
        ) : isLoading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="p-6">
            <DashboardErrorBanner message={error.message || t("dashboard.customerDetails.loadError")} />
          </div>
        ) : customer ? (
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              setActiveTab(value as CustomerProfileTab);
              setNotesAutoFocus(value === "notes");
            }}
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="shrink-0 border-b border-white/10 px-4 pt-4 pb-0">
              <div className="mb-3 pe-8">
                <h2 className="text-base font-semibold truncate">{customer.name}</h2>
                <p className="text-xs text-muted-foreground">{t("dashboard.customerProfile.subtitle")}</p>
              </div>
              <ScrollArea className="w-full">
                <TabsList className="h-auto w-max min-w-full justify-start gap-0.5 bg-transparent p-0 mb-0 flex-wrap">
                  {CUSTOMER_PROFILE_TABS.map((tab) => (
                    <TabsTrigger
                      key={tab}
                      value={tab}
                      className="text-xs px-2.5 py-1.5 h-8 rounded-md data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-none border border-transparent data-[state=active]:border-primary/20"
                    >
                      {tabLabel(tab)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </ScrollArea>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <TabsContent value="overview" className="mt-0 focus-visible:outline-none">
                <OverviewTab
                  customer={customer}
                  companyId={context?.companyId}
                  canEdit={canEdit}
                  onQuickAction={(action) => onQuickAction?.(action, customer.id)}
                  isQuickActionPending={isQuickActionPending}
                />
              </TabsContent>

              <TabsContent value="timeline" className="mt-0 focus-visible:outline-none">
                <TimelineTab customerId={customer.id} companyId={context?.companyId} />
              </TabsContent>

              <TabsContent value="bookings" className="mt-0 focus-visible:outline-none">
                <ProfilePlaceholderTab
                  titleKey="dashboard.customerProfile.tabs.bookings"
                  descriptionKey="dashboard.customerProfile.placeholders.bookings"
                />
              </TabsContent>

              <TabsContent value="invoices" className="mt-0 focus-visible:outline-none">
                <ProfilePlaceholderTab
                  titleKey="dashboard.customerProfile.tabs.invoices"
                  descriptionKey="dashboard.customerProfile.placeholders.invoices"
                />
              </TabsContent>

              <TabsContent value="notes" className="mt-0 focus-visible:outline-none">
                <NotesTab
                  customer={customer}
                  canEdit={canEdit}
                  autoFocusNotes={notesAutoFocus}
                />
              </TabsContent>

              <TabsContent value="files" className="mt-0 focus-visible:outline-none">
                <ProfilePlaceholderTab
                  titleKey="dashboard.customerProfile.tabs.files"
                  descriptionKey="dashboard.customerProfile.placeholders.files"
                />
              </TabsContent>

              <TabsContent value="ai-insights" className="mt-0 focus-visible:outline-none">
                <ProfilePlaceholderTab
                  titleKey="dashboard.customerProfile.tabs.ai-insights"
                  descriptionKey="dashboard.customerProfile.placeholders.aiInsights"
                />
              </TabsContent>

              <TabsContent value="system" className="mt-0 focus-visible:outline-none">
                <SystemTab customer={customer} context={context} />
              </TabsContent>
            </div>
          </Tabs>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
