import type { WorkspaceCommand } from "../types/command-types.js";
import { filterCommandsByRole, searchCommands } from "../types/command-types.js";
import { DEFAULT_COMMANDS } from "../mock/mock-commands.js";

export class CommandEngine {
  private readonly commands: WorkspaceCommand[];

  constructor(commands?: WorkspaceCommand[]) {
    this.commands = commands ?? DEFAULT_COMMANDS;
  }

  list(role: string): WorkspaceCommand[] {
    return filterCommandsByRole(this.commands, role);
  }

  search(role: string, query: string): WorkspaceCommand[] {
    return searchCommands(this.list(role), query);
  }

  getByActionKey(actionKey: string): WorkspaceCommand | undefined {
    return this.commands.find((c) => c.actionKey === actionKey);
  }
}

export const commandEngine = new CommandEngine();
