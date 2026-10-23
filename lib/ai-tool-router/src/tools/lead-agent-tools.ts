import type { ConversationState } from "@workspace/ai-conversation";
import { LeadQualificationPolicyRejectedError } from "@workspace/lead-platform";
import type { Tool, ToolExecutionContext } from "./tool-contract.js";
import type { LeadAgentToolPorts } from "./lead-agent-ports.js";
import { leadsShareVerifiedIdentity } from "./lead-merge-identity.js";
import { validateAgainstSchema } from "../utils/tool-utils.js";

const ACTIVE_STATES: ConversationState[] = [
  "idle",
  "greeting",
  "collecting_information",
  "waiting_user",
  "waiting_api",
  "transferred_to_human",
];

function requireUser(context: ToolExecutionContext): string {
  if (!context.userId?.trim()) throw new Error("An authenticated user is required for lead operations.");
  return context.userId;
}

function readRequiredString(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function readOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const normalized = typeof value === "string" ? value.trim() : String(value).trim();
  return normalized || undefined;
}

function mapLead(lead: Awaited<ReturnType<LeadAgentToolPorts["createLead"]>>["lead"]) {
  return {
    id: lead.id,
    title: lead.title,
    contactName: lead.contactName,
    email: lead.email,
    phone: lead.phone,
    lifecycleStatus: lead.lifecycleStatus,
    score: lead.score,
    isQualified: lead.isQualified,
    customerId: lead.customerId,
    conversationId: lead.conversationId,
  };
}

function nextActionForStatus(status: string): string {
  switch (status) {
    case "new":
      return "Qualify the lead and capture missing contact details.";
    case "qualified":
      return "Schedule first contact or demo.";
    case "contacted":
      return "Book a demo or send proposal materials.";
    case "demo_scheduled":
      return "Confirm attendance and prepare discovery notes.";
    case "proposal_sent":
      return "Follow up on proposal and address objections.";
    case "negotiation":
      return "Confirm decision timeline and convert if ready.";
    case "won":
      return "Convert lead to customer and open onboarding ticket if needed.";
    case "lost":
      return "Do not pursue. Respect the closed outcome.";
    case "converted":
      return "No further sales follow-up. Hand off to onboarding only if that is still open.";
    case "archived":
      return "Do not contact unless the lead is restored.";
    default:
      return "Review lead history and choose the next pipeline stage.";
  }
}

export function createLeadAgentTools(ports: LeadAgentToolPorts): Record<string, Tool> {
  return {
    create_lead: {
      supports: (state) => ACTIVE_STATES.includes(state),
      validate(input) {
        validateAgainstSchema(
          { type: "object", properties: { title: { type: "string", minLength: 1 } }, required: ["title"] },
          input,
        );
      },
      async execute(context, input) {
        const result = await ports.createLead({
          companyId: context.companyId,
          userId: requireUser(context),
          title: readRequiredString(input.title, "Title"),
          contactName: readOptionalString(input.contactName),
          email: readOptionalString(input.email),
          phone: readOptionalString(input.phone),
          companyName: readOptionalString(input.companyName),
          conversationId: context.conversationId,
          aiSummary: readOptionalString(input.aiSummary),
        });
        return { success: true, lead: mapLead(result.lead) };
      },
    },
    update_lead: {
      supports: (state) => ACTIVE_STATES.includes(state),
      validate(input) {
        validateAgainstSchema(
          { type: "object", properties: { leadId: { type: "string", minLength: 1 } }, required: ["leadId"] },
          input,
        );
      },
      async execute(context, input) {
        const result = await ports.updateLead({
          companyId: context.companyId,
          userId: requireUser(context),
          leadId: readRequiredString(input.leadId, "Lead ID"),
          title: readOptionalString(input.title),
          contactName: readOptionalString(input.contactName),
          email: readOptionalString(input.email),
          phone: readOptionalString(input.phone),
          aiSummary: readOptionalString(input.aiSummary),
          score: typeof input.score === "number" ? input.score : undefined,
        });
        return { success: true, lead: mapLead(result.lead) };
      },
    },
    qualify_lead: {
      supports: (state) => ACTIVE_STATES.includes(state),
      validate(input) {
        validateAgainstSchema(
          {
            type: "object",
            properties: {
              leadId: { type: "string", minLength: 1 },
              score: { type: "number" },
              explicitBuyingIntent: { type: "boolean" },
              productInterest: { type: "boolean" },
              statedNeed: { type: "boolean" },
              contactAvailable: { type: "boolean" },
              companyIdentified: { type: "boolean" },
              businessUseCase: { type: "boolean" },
              notAFit: { type: "boolean" },
              conflictingSignals: { type: "boolean" },
            },
            required: ["leadId"],
          },
          input,
        );
      },
      async execute(context, input) {
        const conversationTexts = (context.trustedConversationTexts ?? [])
          .filter((text) => typeof text === "string" && text.trim().length > 0)
          .slice(0, 20);
        const leadId = readRequiredString(input.leadId, "Lead ID");
        let result: Awaited<ReturnType<LeadAgentToolPorts["qualifyLead"]>>;
        try {
          result = await ports.qualifyLead({
            companyId: context.companyId,
            userId: requireUser(context),
            leadId,
            conversationId: context.conversationId,
            score: typeof input.score === "number" ? input.score : undefined,
            conversationTexts,
            qualificationPolicyMode: "enforce",
          });
        } catch (error) {
          if (error instanceof LeadQualificationPolicyRejectedError) {
            return {
              success: false,
              qualificationApplied: false,
              policy: error.evaluation,
              instruction:
                "Do not tell the customer they are qualified. Evidence was insufficient or the policy did not apply.",
            };
          }
          const message = error instanceof Error ? error.message : "";
          if (/Lead not found/i.test(message)) {
            return {
              success: false,
              qualificationApplied: false,
              errorCode: "NOT_A_LEAD",
              needs_data: { missing: ["lead"] },
              message:
                "leadId is not a lead in this company. Do not pass a customer id to qualify_lead.",
            };
          }
          throw error;
        }
        const qualificationApplied = result.qualificationApplied === true;
        return {
          success: qualificationApplied,
          lead: mapLead(result.lead),
          qualificationApplied,
          policy: result.policy ?? null,
          instruction: qualificationApplied
            ? "You may tell the customer they are qualified only when qualificationApplied is true."
            : "Do not tell the customer they are qualified. Evidence was insufficient or the policy did not apply.",
        };
      },
    },
    convert_lead: {
      supports: (state) => ACTIVE_STATES.includes(state),
      validate(input) {
        validateAgainstSchema(
          { type: "object", properties: { leadId: { type: "string", minLength: 1 } }, required: ["leadId"] },
          input,
        );
      },
      async execute(context, input) {
        const result = await ports.convertLead({
          companyId: context.companyId,
          userId: requireUser(context),
          leadId: readRequiredString(input.leadId, "Lead ID"),
        });
        return { success: true, lead: mapLead(result.lead), customerId: result.customerId };
      },
    },
    assign_lead: {
      supports: (state) => ACTIVE_STATES.includes(state),
      validate(input) {
        validateAgainstSchema(
          { type: "object", properties: { leadId: { type: "string", minLength: 1 } }, required: ["leadId"] },
          input,
        );
      },
      async execute(context, input) {
        const result = await ports.assignLead({
          companyId: context.companyId,
          userId: requireUser(context),
          leadId: readRequiredString(input.leadId, "Lead ID"),
          assigneeUserId: readOptionalString(input.assigneeUserId),
          assignmentMethod: readOptionalString(input.assignmentMethod),
        });
        return { success: true, lead: mapLead(result.lead) };
      },
    },
    search_lead: {
      supports: (state) => ACTIVE_STATES.includes(state),
      validate(input) {
        validateAgainstSchema({ type: "object", properties: {} }, input);
      },
      async execute(context, input) {
        const result = await ports.searchLeads({
          companyId: context.companyId,
          userId: requireUser(context),
          query: readOptionalString(input.query),
          lifecycleStatus: readOptionalString(input.lifecycleStatus),
          limit: typeof input.limit === "number" ? input.limit : 10,
        });
        return { success: true, leads: result.leads, total: result.total };
      },
    },
    merge_lead: {
      supports: (state) => ACTIVE_STATES.includes(state),
      validate(input) {
        validateAgainstSchema(
          {
            type: "object",
            properties: {
              primaryLeadId: { type: "string", minLength: 1 },
              duplicateLeadIds: { type: "array", items: { type: "string" }, minItems: 1 },
            },
            required: ["primaryLeadId", "duplicateLeadIds"],
          },
          input,
        );
      },
      async execute(context, input) {
        const duplicateLeadIds = Array.isArray(input.duplicateLeadIds)
          ? input.duplicateLeadIds.map((value) => readRequiredString(value, "Duplicate lead ID"))
          : [];
        if (!ports.getLead) {
          return {
            success: false,
            errorCode: "LEAD_IDENTITY_CHECK_UNAVAILABLE",
            message:
              "Lead merge is blocked because identity verification (getLead) is unavailable. Name similarity alone is never enough.",
          };
        }
        const companyId = context.companyId;
        const userId = requireUser(context);
        const primary = await ports.getLead({
          companyId,
          userId,
          leadId: readRequiredString(input.primaryLeadId, "Primary lead ID"),
        });
        if (!primary.lead || primary.lead.companyId !== companyId) {
          return { success: false, errorCode: "LEAD_NOT_FOUND", message: "Primary lead was not found." };
        }
        for (const duplicateLeadId of duplicateLeadIds) {
          const duplicate = await ports.getLead({ companyId, userId, leadId: duplicateLeadId });
          if (!duplicate.lead || duplicate.lead.companyId !== companyId) {
            return {
              success: false,
              errorCode: "LEAD_NOT_FOUND",
              message: "One of the leads was not found in this company.",
            };
          }
          if (!leadsShareVerifiedIdentity(primary.lead, duplicate.lead)) {
            return {
              success: false,
              errorCode: "LEAD_IDENTITY_UNVERIFIED",
              message:
                "Leads can be merged only when they share a verified phone or email. Name similarity is not enough.",
            };
          }
        }
        const result = await ports.mergeLeads({
          companyId: context.companyId,
          userId: requireUser(context),
          primaryLeadId: readRequiredString(input.primaryLeadId, "Primary lead ID"),
          duplicateLeadIds,
        });
        return { success: true, lead: mapLead(result.lead) };
      },
    },
    score_lead: {
      supports: (state) => ACTIVE_STATES.includes(state),
      validate(input) {
        validateAgainstSchema(
          {
            type: "object",
            properties: {
              leadId: { type: "string", minLength: 1 },
              score: { type: "number" },
              explanation: { type: "string" },
            },
            required: ["leadId", "score"],
          },
          input,
        );
      },
      async execute(context, input) {
        const score = Number(input.score);
        if (!Number.isFinite(score) || score < 0 || score > 100) {
          throw new Error("Score must be a number from 0 to 100.");
        }
        const explanation = readOptionalString(input.explanation) ?? null;
        const result = await ports.scoreLead({
          companyId: context.companyId,
          userId: requireUser(context),
          leadId: readRequiredString(input.leadId, "Lead ID"),
          score,
          explanation,
        });
        if (explanation && ports.getLead && ports.updateLead) {
          const existing = await ports.getLead({
            companyId: context.companyId,
            userId: requireUser(context),
            leadId: readRequiredString(input.leadId, "Lead ID"),
          });
          const line = `Score evidence: ${explanation}`;
          const current = existing.lead?.aiSummary?.trim() ?? "";
          if (existing.lead && !current.includes(line)) {
            await ports.updateLead({
              companyId: context.companyId,
              userId: requireUser(context),
              leadId: existing.lead.id,
              aiSummary: current ? `${current}\n${line}` : line,
              score,
            });
          }
        }
        return {
          success: true,
          lead: mapLead(result.lead),
          explanation,
          unknown: ["budget", "timeline", "purchase_authority"],
        };
      },
    },
    suggest_next_action: {
      supports: (state) => ACTIVE_STATES.includes(state),
      validate(input) {
        validateAgainstSchema(
          { type: "object", properties: { leadId: { type: "string", minLength: 1 } }, required: ["leadId"] },
          input,
        );
      },
      async execute(context, input) {
        const result = await ports.suggestNextAction({
          companyId: context.companyId,
          userId: requireUser(context),
          leadId: readRequiredString(input.leadId, "Lead ID"),
        });
        return {
          success: true,
          suggestion: result.suggestion,
          lead: result.lead ? mapLead(result.lead) : null,
        };
      },
    },
  };
}

export { nextActionForStatus };
