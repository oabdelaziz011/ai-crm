import type { FloatingAiQuickAction } from "./types";

const QUICK_ACTIONS_BY_PAGE: Record<string, FloatingAiQuickAction[]> = {
  customers: [
    { id: "create-customer", labelKey: "floatingAi.actions.createCustomer", prompt: "Help me create a new customer" },
    { id: "search-customer", labelKey: "floatingAi.actions.searchCustomer", prompt: "Help me search for a customer" },
    { id: "merge-duplicates", labelKey: "floatingAi.actions.mergeDuplicates", prompt: "Find and merge duplicate customers", destructive: true },
    { id: "import-excel", labelKey: "floatingAi.actions.importExcel", prompt: "How do I import customers from Excel?" },
  ],
  invoices: [
    { id: "create-invoice", labelKey: "floatingAi.actions.createInvoice", prompt: "Help me create a new invoice" },
    { id: "unpaid-invoices", labelKey: "floatingAi.actions.unpaidInvoices", prompt: "Show me unpaid invoices summary" },
    { id: "revenue-summary", labelKey: "floatingAi.actions.revenueSummary", prompt: "Give me a revenue summary" },
  ],
  calendar: [
    { id: "book-appointment", labelKey: "floatingAi.actions.bookAppointment", prompt: "Help me book an appointment" },
    { id: "move-booking", labelKey: "floatingAi.actions.moveBooking", prompt: "Help me move a booking to another time" },
  ],
  bookings: [
    { id: "book-appointment", labelKey: "floatingAi.actions.bookAppointment", prompt: "Help me book an appointment" },
    { id: "today-schedule", labelKey: "floatingAi.actions.todaySchedule", prompt: "What's on the schedule today?" },
  ],
  operations: [
    { id: "book-appointment", labelKey: "floatingAi.actions.bookAppointment", prompt: "Help me book an appointment" },
    { id: "today-schedule", labelKey: "floatingAi.actions.todaySchedule", prompt: "What's on the schedule today?" },
  ],
  "universal-operations": [
    { id: "book-appointment", labelKey: "floatingAi.actions.bookAppointment", prompt: "Help me book an appointment" },
    { id: "today-schedule", labelKey: "floatingAi.actions.todaySchedule", prompt: "What's on the schedule today?" },
  ],
  knowledge: [
    { id: "ask-documents", labelKey: "floatingAi.actions.askDocuments", prompt: "Answer using our company documents" },
    { id: "search-knowledge", labelKey: "floatingAi.actions.searchKnowledge", prompt: "Search our knowledge base" },
  ],
  reports: [
    { id: "business-summary", labelKey: "floatingAi.actions.businessSummary", prompt: "Summarize business performance" },
  ],
  executive: [
    {
      id: "exec-brief",
      labelKey: "floatingAi.actions.executiveBrief",
      prompt: "Summarize business health from the current Executive Intelligence dashboard and prioritize today.",
    },
    {
      id: "exec-risks",
      labelKey: "floatingAi.actions.executiveRisks",
      prompt: "What are the top risks visible from the Executive Intelligence KPIs?",
    },
    {
      id: "exec-actions",
      labelKey: "floatingAi.actions.executiveActions",
      prompt: "What immediate actions do you recommend based on the Executive Intelligence KPIs?",
    },
    {
      id: "exec-finance",
      labelKey: "floatingAi.actions.openFinancial",
      navigateTo: "/financial",
    },
  ],
  default: [
    { id: "help", labelKey: "floatingAi.actions.help", prompt: "What can you help me with on this page?" },
  ],
};

export function getQuickActionsForPage(page: string): FloatingAiQuickAction[] {
  return QUICK_ACTIONS_BY_PAGE[page] ?? QUICK_ACTIONS_BY_PAGE.default;
}
