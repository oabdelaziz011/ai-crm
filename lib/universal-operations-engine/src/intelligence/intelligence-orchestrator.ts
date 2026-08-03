import type { BusinessContextField, CopilotCapability, IntelligenceSnapshot } from "../types/intelligence-types.js";
import type { OperationsCustomer360WorkspaceData } from "../types/customer360-panel-types.js";
import { contextEngine } from "./context-engine.js";
import { workflowEngine } from "./workflow-engine.js";
import { alertEngine } from "./alert-engine.js";
import { recommendationEngine } from "./recommendation-engine.js";
import { operationalIntelligenceEngine } from "./operational-intelligence-engine.js";

const BUSINESS_CONTEXT_BY_TEMPLATE: Record<string, BusinessContextField[]> = {
  clinic: [
    { key: "patient", label: "Patient", value: "", icon: "User" },
    { key: "doctor", label: "Doctor", value: "", icon: "Stethoscope" },
    { key: "allergies", label: "Allergies", value: "Penicillin", icon: "AlertTriangle" },
    { key: "medical_notes", label: "Medical Notes", value: "Hypertension — monitored", icon: "FileText" },
    { key: "insurance", label: "Insurance", value: "Daman Premium", icon: "Shield" },
  ],
  training_center: [
    { key: "student", label: "Student", value: "", icon: "GraduationCap" },
    { key: "instructor", label: "Instructor", value: "", icon: "UserCheck" },
    { key: "course", label: "Course", value: "Advanced React", icon: "BookOpen" },
    { key: "attendance", label: "Attendance", value: "92%", icon: "CheckCircle" },
  ],
  automotive: [
    { key: "vehicle", label: "Vehicle", value: "Toyota Camry 2022", icon: "Car" },
    { key: "mileage", label: "Mileage", value: "42,300 km", icon: "Gauge" },
    { key: "vin", label: "VIN", value: "JTDBT923…4821", icon: "Hash" },
    { key: "warranty", label: "Warranty", value: "Active until 2027", icon: "Shield" },
  ],
  hr: [
    { key: "candidate", label: "Candidate", value: "", icon: "User" },
    { key: "resume", label: "Resume", value: "Senior Engineer — 8 yrs", icon: "FileText" },
    { key: "interview", label: "Interview", value: "Round 2 — Technical", icon: "Video" },
    { key: "offer", label: "Offer", value: "Pending approval", icon: "BadgeCheck" },
  ],
};

const COPILOT_CAPABILITIES: CopilotCapability[] = [
  { id: "cp_1", labelKey: "copilot.summarize", promptKey: "summarize" },
  { id: "cp_2", labelKey: "copilot.explainTimeline", promptKey: "explain_timeline" },
  { id: "cp_3", labelKey: "copilot.answer", promptKey: "answer" },
  { id: "cp_4", labelKey: "copilot.followUp", promptKey: "follow_up" },
  { id: "cp_5", labelKey: "copilot.whatsapp", promptKey: "whatsapp" },
  { id: "cp_6", labelKey: "copilot.email", promptKey: "email" },
  { id: "cp_7", labelKey: "copilot.note", promptKey: "note" },
  { id: "cp_8", labelKey: "copilot.risk", promptKey: "risk" },
  { id: "cp_9", labelKey: "copilot.nextAction", promptKey: "next_action" },
];

function groupCommunications(ctx: OperationsCustomer360WorkspaceData) {
  const groups = new Map<string, typeof ctx.communications>();
  for (const item of ctx.communications) {
    const dateLabel = new Date(item.occurredAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    const list = groups.get(dateLabel) ?? [];
    list.push(item);
    groups.set(dateLabel, list);
  }
  return Array.from(groups.entries()).map(([dateLabel, items]) => ({
    dateLabel,
    items: items.map((i) => ({ id: i.id, channel: i.channel, preview: i.preview, occurredAt: i.occurredAt, actor: i.actor })),
  }));
}

function buildBusinessContext(templateKey: string, ctx: OperationsCustomer360WorkspaceData): BusinessContextField[] {
  const base = BUSINESS_CONTEXT_BY_TEMPLATE[templateKey] ?? BUSINESS_CONTEXT_BY_TEMPLATE.clinic!;
  return base.map((field) => {
    if (field.key === "patient" || field.key === "student" || field.key === "candidate") {
      return { ...field, value: ctx.customer.name };
    }
    if (field.key === "doctor" || field.key === "instructor") {
      return { ...field, value: ctx.todaysOperation.assignedEmployee };
    }
    return field;
  });
}

export class IntelligenceOrchestrator {
  buildSnapshot(templateKey: string, ctx: OperationsCustomer360WorkspaceData): IntelligenceSnapshot {
    const recommendations = recommendationEngine.generate(ctx);
    const topRec = recommendations[0];

    return {
      journey: contextEngine.buildJourney(templateKey),
      workflow: workflowEngine.buildTracker(workflowEngine.resolveCurrentStageFromStatus(ctx.currentStatus)),
      alerts: alertEngine.evaluate(ctx),
      recommendations,
      operationalHealth: operationalIntelligenceEngine.buildHealthMetrics(),
      quickDecision: operationalIntelligenceEngine.buildQuickDecision(
        ctx,
        topRec?.title ?? "Review customer profile",
        topRec?.actionKey ?? "review",
      ),
      businessContext: buildBusinessContext(templateKey, ctx),
      miniKpis: operationalIntelligenceEngine.buildMiniKpis(ctx),
      copilotCapabilities: COPILOT_CAPABILITIES,
      communicationGroups: groupCommunications(ctx),
    };
  }
}

export const intelligenceOrchestrator = new IntelligenceOrchestrator();
