import { useEffect } from "react";
import { useLocation } from "wouter";
import { FinancialWorkspace } from "@/components/financial-workspace/financial-workspace";

/**
 * Legacy `/dashboard/financial` entry — same workspace, overview tab.
 * Keeps bookmarks working without a duplicate menu item.
 */
export function FinancialBillingDashboardPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/invoices?tab=overview");
  }, [setLocation]);

  return <FinancialWorkspace initialTab="overview" />;
}
