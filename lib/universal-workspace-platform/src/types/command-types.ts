export type WorkspaceCommandCategory =
  | "create"
  | "navigate"
  | "action"
  | "search"
  | "ai"
  | "workspace";

export type WorkspaceCommand = {
  id: string;
  labelKey: string;
  descriptionKey?: string;
  category: WorkspaceCommandCategory;
  shortcut?: string;
  icon: string;
  roles: string[];
  permissions: string[];
  actionKey: string;
  keywords: string[];
};

export function filterCommandsByRole(commands: WorkspaceCommand[], role: string): WorkspaceCommand[] {
  return commands.filter((c) => c.roles.includes(role));
}

export function searchCommands(commands: WorkspaceCommand[], query: string): WorkspaceCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  return commands.filter(
    (c) =>
      c.id.includes(q) ||
      c.actionKey.includes(q) ||
      c.keywords.some((k) => k.includes(q)),
  );
}
