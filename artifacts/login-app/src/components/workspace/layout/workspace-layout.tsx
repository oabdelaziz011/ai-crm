import { Redirect } from "wouter";
import { companyWorkspaceHref } from "@/lib/company-workspace/company-workspace-routes";

/**
 * Legacy Admin Workspace (`/dashboard/workspace*`).
 * Content moved into Company Workspace → Plan & billing tab.
 * Keep this redirect so bookmarks and old links still resolve.
 */
export function WorkspaceLayout() {
  return <Redirect to={companyWorkspaceHref("subscription")} />;
}
