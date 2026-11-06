export type MobileCompany = {
  id: string;
  name: string | null;
  subdomain: string | null;
  status: string | null;
};

export type MobileSession = {
  scope: "tenant" | "platform";
  isSuperAdmin: boolean;
  userId: string;
  displayName: string | null;
  company: MobileCompany | null;
  permissions: string[];
};

export type SessionFailureAction = "sign_out" | "retry" | "stay";

export function sessionFailureAction(status: number): SessionFailureAction {
  if (status === 401 || status === 403) return "sign_out";
  if (status >= 500 || status === 0) return "retry";
  return "stay";
}

export function canAccess(session: MobileSession | null, permission: string): boolean {
  if (!session || session.scope !== "tenant" || !session.company?.id) return false;
  if (session.isSuperAdmin) return true;
  return session.permissions.includes(permission);
}

export type MobileModuleId =
  | "dashboard"
  | "crm"
  | "omnichannel"
  | "email"
  | "tickets"
  | "company"
  | "notifications"
  | "ai";

const MODULE_PERMISSIONS: Record<Exclude<MobileModuleId, "dashboard" | "notifications">, string[]> = {
  crm: ["customers.view", "leads.view", "opportunities.view"],
  omnichannel: ["ai.conversations.view", "ai.conversations.view_assigned"],
  email: ["email.view"],
  tickets: ["tickets.view"],
  company: ["company.view", "settings.view"],
  ai: ["ai_chat.use", "ai.conversations.reply"],
};

export function visibleModules(session: MobileSession | null): MobileModuleId[] {
  if (!session) return [];
  if (session.scope !== "tenant") return ["dashboard"];
  const modules: MobileModuleId[] = ["dashboard", "notifications"];
  for (const [moduleId, permissions] of Object.entries(MODULE_PERMISSIONS) as Array<
    [Exclude<MobileModuleId, "dashboard" | "notifications">, string[]]
  >) {
    if (permissions.some((permission) => canAccess(session, permission))) modules.push(moduleId);
  }
  return modules;
}

export function tenantCompanyId(session: MobileSession | null): string {
  if (!session || session.scope !== "tenant" || !session.company?.id) {
    throw new Error("tenant_required");
  }
  return session.company.id;
}
