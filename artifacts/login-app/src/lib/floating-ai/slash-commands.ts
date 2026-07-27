import type { FloatingAiSlashCommand } from "./types";

export const SLASH_COMMANDS: FloatingAiSlashCommand[] = [
  {
    command: "/create customer",
    labelKey: "floatingAi.slash.createCustomer",
    descriptionKey: "floatingAi.slash.createCustomerDesc",
    prompt: "Help me create a new customer",
  },
  {
    command: "/search invoice",
    labelKey: "floatingAi.slash.searchInvoice",
    descriptionKey: "floatingAi.slash.searchInvoiceDesc",
    prompt: "Help me search for an invoice",
  },
  {
    command: "/book appointment",
    labelKey: "floatingAi.slash.bookAppointment",
    descriptionKey: "floatingAi.slash.bookAppointmentDesc",
    prompt: "Help me book an appointment",
  },
  {
    command: "/help",
    labelKey: "floatingAi.slash.help",
    descriptionKey: "floatingAi.slash.helpDesc",
    prompt: "What can you help me with? List available commands and actions.",
  },
  {
    command: "/agent",
    labelKey: "floatingAi.slash.agent",
    descriptionKey: "floatingAi.slash.agentDesc",
    prompt: "",
    agentMode: true,
  },
];

export type SlashCommandMatch = {
  command: FloatingAiSlashCommand;
  remainder: string;
};

export function parseSlashCommand(input: string): SlashCommandMatch | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const lower = trimmed.toLowerCase();

  for (const command of SLASH_COMMANDS) {
    const cmdLower = command.command.toLowerCase();
    if (lower === cmdLower || lower.startsWith(`${cmdLower} `)) {
      const remainder = trimmed.slice(command.command.length).trim();
      return { command, remainder };
    }
  }

  return null;
}

export function filterSlashCommands(query: string): FloatingAiSlashCommand[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed.startsWith("/")) return [];
  if (trimmed === "/") return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((cmd) => cmd.command.toLowerCase().startsWith(trimmed));
}
