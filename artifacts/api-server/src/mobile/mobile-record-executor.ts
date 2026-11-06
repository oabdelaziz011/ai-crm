/**
 * Runs an already-authorized mobile action through the existing platform
 * services. Callers must pass the company id from the trusted session.
 * Outbound channel delivery is not performed here: a confirmed send returns
 * the existing dispatch payload for the client to submit after the user confirms.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLeadPlatformServices } from "@workspace/lead-platform";
import { createOpportunityPlatformServices } from "@workspace/opportunity-platform";
import { createTicketPlatformServices } from "@workspace/ticket-platform";
import { createConversationServices } from "@workspace/ai-conversation";
import { HttpError } from "../middleware/error-handler.js";
import type { MobileRecordAction } from "./mobile-actions.js";
import { updateOwnedCustomer } from "./mobile-customer-update.js";
import { mapMobileServiceError } from "./mobile-service-errors.js";

export type MobileActor = {
  userId: string;
  companyId: string;
  isSuperAdmin: boolean;
  permissions: string[];
};

export type MobileRecordPorts = {
  createCustomer(actor: MobileActor, name: string, email: string | null, phone: string | null): Promise<{ id: string }>;
  updateCustomer(actor: MobileActor, id: string, name: string, phone: string | null): Promise<void>;
  createLead(actor: MobileActor, title: string, email: string | null, phone: string | null): Promise<{ id: string }>;
  updateLead(actor: MobileActor, id: string, title: string): Promise<void>;
  createOpportunity(actor: MobileActor, name: string, currency: string): Promise<{ id: string }>;
  updateOpportunity(actor: MobileActor, id: string, name: string): Promise<void>;
  changeTicketStatus(actor: MobileActor, id: string, status: string): Promise<void>;
  changeTicketPriority(actor: MobileActor, id: string, priority: string): Promise<void>;
  assignTicket(actor: MobileActor, id: string, assignedUserId: string): Promise<void>;
  addTicketComment(actor: MobileActor, id: string, body: string, isInternal: boolean): Promise<void>;
  assignConversation(actor: MobileActor, id: string, assignedUserId: string): Promise<void>;
  updateConversationState(actor: MobileActor, id: string, state: string): Promise<void>;
  markConversationRead(actor: MobileActor, id: string): Promise<void>;
  markConversationUnread(actor: MobileActor, id: string): Promise<{ unreadCountEmployee: number }>;
  prepareConversationSend(actor: MobileActor, id: string, text: string): Promise<{ companyChannelId: string; text: string }>;
  markNotificationRead(actor: MobileActor, id: string): Promise<void>;
  markAllNotificationsRead(actor: MobileActor): Promise<void>;
  createBranch(actor: MobileActor, input: { name: string; code: string; timezone: string; city: string | null; phone: string | null }): Promise<{ id: string }>;
  updateBranch(actor: MobileActor, id: string, input: { name: string; code: string; timezone: string }): Promise<void>;
  saveBranchHours(actor: MobileActor, id: string, weeklyHours: unknown): Promise<void>;
  updateRole(actor: MobileActor, id: string, name: string): Promise<void>;
  saveEmailDraft(actor: MobileActor, id: string, draft: { subject: string; body: string; mode: string }): Promise<void>;
};

function context(actor: MobileActor) {
  return {
    userId: actor.userId,
    companyId: actor.companyId,
    isSuperAdmin: actor.isSuperAdmin,
    hasPermission: (code: string) => actor.isSuperAdmin || actor.permissions.includes(code),
  };
}

function raise(error: unknown): never {
  const mapped = mapMobileServiceError(error);
  if (mapped) throw mapped;
  throw error;
}

export function createRecordPorts(client: SupabaseClient): MobileRecordPorts {
  const leads = createLeadPlatformServices(client);
  const opportunities = createOpportunityPlatformServices(client);
  const tickets = createTicketPlatformServices(client);
  const conversationServices = createConversationServices(client);
  return {
    async createCustomer(actor, name, email, phone) {
      const { data, error } = await client.from("customers").insert({
        company_id: actor.companyId,
        user_id: actor.userId,
        name,
        email,
        phone,
        status: "active",
        source: "manual",
      }).select("id").single();
      if (error) throw new HttpError(400, "Customer could not be saved.", "validation_error");
      return { id: String(data.id) };
    },
    async updateCustomer(actor, id, name, phone) {
      await updateOwnedCustomer(client, { companyId: actor.companyId, id, name, phone });
    },
    async createLead(actor, title, email, phone) {
      try {
        const result = await leads.commands.createLead(context(actor), {
          companyId: actor.companyId,
          title,
          email: email ?? undefined,
          phone: phone ?? undefined,
        });
        return { id: result.lead.id };
      } catch (error) {
        raise(error);
      }
    },
    async updateLead(actor, id, title) {
      try {
        await leads.commands.updateLead(context(actor), { companyId: actor.companyId, leadId: id, title });
      } catch (error) {
        raise(error);
      }
    },
    async createOpportunity(actor, name, currency) {
      try {
        const result = await opportunities.commands.createManual(context(actor), {
          companyId: actor.companyId,
          name,
          currency,
          companyDefaultCurrency: currency,
        });
        return { id: result.opportunity.id };
      } catch (error) {
        raise(error);
      }
    },
    async updateOpportunity(actor, id, name) {
      try {
        await opportunities.commands.updateFields(context(actor), { companyId: actor.companyId, opportunityId: id, name });
      } catch (error) {
        raise(error);
      }
    },
    async changeTicketStatus(actor, id, status) {
      try {
        await tickets.commands.changeStatus(context(actor), { companyId: actor.companyId, ticketId: id, status: status as "open" });
      } catch (error) {
        raise(error);
      }
    },
    async changeTicketPriority(actor, id, priority) {
      try {
        await tickets.commands.changePriority(context(actor), { companyId: actor.companyId, ticketId: id, priority: priority as "normal" });
      } catch (error) {
        raise(error);
      }
    },
    async assignTicket(actor, id, assignedUserId) {
      try {
        await tickets.commands.assignTicket(context(actor), { companyId: actor.companyId, ticketId: id, assigneeUserId: assignedUserId });
      } catch (error) {
        raise(error);
      }
    },
    async addTicketComment(actor, id, body, isInternal) {
      try {
        await tickets.commands.addComment(context(actor), { companyId: actor.companyId, ticketId: id, body, isInternal });
      } catch (error) {
        raise(error);
      }
    },
    async assignConversation(actor, id, assignedUserId) {
      try {
        await conversationServices.conversations.assignConversation(context(actor), { conversationId: id, assignedUserId });
      } catch (error) {
        raise(error);
      }
    },
    async updateConversationState(actor, id, state) {
      try {
        await conversationServices.conversations.updateState(context(actor), { conversationId: id, state: state as "closed" });
      } catch (error) {
        raise(error);
      }
    },
    async markConversationRead(actor, id) {
      const { error } = await client.from("conversations").update({ unread_count_employee: 0 }).eq("company_id", actor.companyId).eq("id", id);
      if (error) throw new HttpError(400, "Conversation could not be updated.", "validation_error");
    },
    async markConversationUnread(actor, id) {
      try {
        const record = await conversationServices.conversations.markEmployeeUnread(context(actor), id);
        return { unreadCountEmployee: record.unread_count_employee };
      } catch (error) {
        raise(error);
      }
    },
    async prepareConversationSend(actor, id, text) {
      const { data, error } = await client.from("conversations").select("id, company_channel_id").eq("company_id", actor.companyId).eq("id", id).maybeSingle();
      if (error || !data) throw new HttpError(404, "Record not found.", "not_found");
      const companyChannelId = typeof data.company_channel_id === "string" ? data.company_channel_id : "";
      if (!companyChannelId) throw new HttpError(400, "This conversation has no company channel.", "channel_required");
      return { companyChannelId, text };
    },
    async markNotificationRead(actor, id) {
      const { error } = await client.from("notifications").update({ is_read: true }).eq("company_id", actor.companyId).eq("user_id", actor.userId).eq("id", id);
      if (error) throw new HttpError(400, "Notification could not be updated.", "validation_error");
    },
    async markAllNotificationsRead(actor) {
      const { error } = await client.from("notifications").update({ is_read: true }).eq("company_id", actor.companyId).eq("user_id", actor.userId).eq("is_read", false);
      if (error) throw new HttpError(400, "Notifications could not be updated.", "validation_error");
    },
    async createBranch(actor, input) {
      const { data, error } = await client.from("branches").insert({
        company_id: actor.companyId,
        name: input.name,
        code: input.code.toUpperCase(),
        timezone: input.timezone,
        city: input.city,
        phone: input.phone,
        status: "active",
        is_primary: false,
        created_by: actor.userId,
        updated_by: actor.userId,
      }).select("id").single();
      if (error) throw new HttpError(400, "Branch could not be saved.", "validation_error");
      return { id: String(data.id) };
    },
    async updateBranch(actor, id, input) {
      const { error } = await client.from("branches").update({
        name: input.name,
        code: input.code.toUpperCase(),
        timezone: input.timezone,
        updated_by: actor.userId,
      }).eq("company_id", actor.companyId).eq("id", id);
      if (error) throw new HttpError(400, "Branch could not be saved.", "validation_error");
    },
    async saveBranchHours(actor, id, weeklyHours) {
      const existing = await client.from("branches").select("settings").eq("company_id", actor.companyId).eq("id", id).maybeSingle();
      if (existing.error || !existing.data) throw new HttpError(404, "Record not found.", "not_found");
      const settings = existing.data.settings && typeof existing.data.settings === "object" ? existing.data.settings as Record<string, unknown> : {};
      const { error } = await client.from("branches").update({
        settings: { ...settings, weeklyHours },
        updated_by: actor.userId,
      }).eq("company_id", actor.companyId).eq("id", id);
      if (error) throw new HttpError(400, "Branch hours could not be saved.", "validation_error");
    },
    async updateRole(actor, id, name) {
      const existing = await client.from("roles").select("id, company_id, is_system").eq("id", id).maybeSingle();
      if (existing.error || !existing.data) throw new HttpError(404, "Record not found.", "not_found");
      if (existing.data.company_id !== actor.companyId || existing.data.is_system === true) {
        throw new HttpError(403, "Permission denied.", "forbidden");
      }
      const { error } = await client.from("roles").update({ name }).eq("company_id", actor.companyId).eq("id", id);
      if (error) throw new HttpError(400, "Role could not be saved.", "validation_error");
    },
    async saveEmailDraft(actor, id, draft) {
      const existing = await client.from("conversations").select("id, channel_type, metadata").eq("company_id", actor.companyId).eq("id", id).maybeSingle();
      if (existing.error || !existing.data) throw new HttpError(404, "Record not found.", "not_found");
      if (String(existing.data.channel_type ?? "") !== "email") throw new HttpError(400, "Drafts are stored on email conversations.", "validation_error");
      const metadata = existing.data.metadata && typeof existing.data.metadata === "object" ? existing.data.metadata as Record<string, unknown> : {};
      const { error } = await client.from("conversations").update({
        metadata: { ...metadata, valueorMobileDraft: { ...draft, sent: false } },
      }).eq("company_id", actor.companyId).eq("id", id);
      if (error) throw new HttpError(400, "Draft could not be saved.", "validation_error");
    },
  };
}

export async function runMobileRecord(
  actor: MobileActor,
  action: MobileRecordAction,
  ports: MobileRecordPorts,
): Promise<Record<string, unknown>> {
  switch (action.type) {
    case "customer.create":
      return { ok: true, ...(await ports.createCustomer(actor, action.name, action.email, action.phone)) };
    case "customer.update":
      await ports.updateCustomer(actor, action.id, action.name, action.phone);
      return { ok: true };
    case "lead.create":
      return { ok: true, ...(await ports.createLead(actor, action.title, action.email, action.phone)) };
    case "lead.update":
      await ports.updateLead(actor, action.id, action.title);
      return { ok: true };
    case "opportunity.create":
      return { ok: true, ...(await ports.createOpportunity(actor, action.name, action.currency)) };
    case "opportunity.update":
      await ports.updateOpportunity(actor, action.id, action.name);
      return { ok: true };
    case "ticket.status":
      await ports.changeTicketStatus(actor, action.id, action.status);
      return { ok: true };
    case "ticket.priority":
      await ports.changeTicketPriority(actor, action.id, action.priority);
      return { ok: true };
    case "ticket.assign":
      await ports.assignTicket(actor, action.id, action.assignedUserId);
      return { ok: true };
    case "ticket.note":
      await ports.addTicketComment(actor, action.id, action.body, true);
      return { ok: true, internal: true };
    case "ticket.reply":
      await ports.addTicketComment(actor, action.id, action.body, false);
      return { ok: true, internal: false };
    case "conversation.assign":
      await ports.assignConversation(actor, action.id, action.assignedUserId);
      return { ok: true };
    case "conversation.state":
      await ports.updateConversationState(actor, action.id, action.state);
      return { ok: true };
    case "conversation.read":
      await ports.markConversationRead(actor, action.id);
      return { ok: true };
    case "conversation.unread":
      return { ok: true, ...(await ports.markConversationUnread(actor, action.id)) };
    case "conversation.send": {
      const prepared = await ports.prepareConversationSend(actor, action.id, action.text);
      return {
        ok: true,
        sent: false,
        delivery: {
          path: "/api/omnichannel/outbound/dispatch",
          body: {
            companyId: actor.companyId,
            conversationId: action.id,
            companyChannelId: prepared.companyChannelId,
            text: prepared.text,
            persistConversationMessage: true,
          },
        },
      };
    }
    case "notification.read":
      await ports.markNotificationRead(actor, action.id);
      return { ok: true };
    case "notification.read_all":
      await ports.markAllNotificationsRead(actor);
      return { ok: true };
    case "branch.create":
      return { ok: true, ...(await ports.createBranch(actor, action)) };
    case "branch.update":
      await ports.updateBranch(actor, action.id, action);
      return { ok: true };
    case "branch.hours":
      await ports.saveBranchHours(actor, action.id, action.weeklyHours);
      return { ok: true };
    case "role.update":
      await ports.updateRole(actor, action.id, action.name);
      return { ok: true };
    case "email.draft":
      await ports.saveEmailDraft(actor, action.id, action);
      return { ok: true, sent: false };
    default:
      throw new HttpError(400, "This action is not supported.", "validation_error");
  }
}
