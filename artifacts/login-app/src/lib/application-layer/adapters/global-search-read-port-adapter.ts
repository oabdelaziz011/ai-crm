import type { SupabaseClient } from "@supabase/supabase-js";

import type {

  GlobalSearchReadPort,

  GlobalSearchResultModel,

  EntityContactReadPort,

  EntityTagReadPort,

  EntityFileReadPort,

  EntityActivityReadPort,

  EntityCustomFieldReadPort,

} from "@workspace/application-layer";

import { createLoginAppCustomerReadPort } from "./customer-read-port-adapter.js";

import { createLoginAppLeadReadPortAdapter } from "./lead-read-port-adapter.js";

import type { LoginAppPortContext } from "./customer-read-port-adapter.js";



function scoreMatch(text: string, query: string): number {

  const normalized = text.toLowerCase();

  const q = query.toLowerCase();

  if (normalized === q) return 1;

  if (normalized.startsWith(q)) return 0.9;

  if (normalized.includes(q)) return 0.75;

  return 0.5;

}



export type GlobalSearchEntityPorts = Readonly<{

  entityContactRead: EntityContactReadPort;

  entityTagRead: EntityTagReadPort;

  entityFileRead: EntityFileReadPort;

  entityActivityRead: EntityActivityReadPort;

  entityCustomFieldRead: EntityCustomFieldReadPort;

}>;



export function createLoginAppGlobalSearchReadPort(

  client: SupabaseClient,

  ctx: LoginAppPortContext,

  entityPorts?: GlobalSearchEntityPorts,

): GlobalSearchReadPort {

  const customerRead = createLoginAppCustomerReadPort(client, ctx);

  const leadRead = createLoginAppLeadReadPortAdapter(client, ctx);



  return {

    async search(tenantId, query, limit = 30) {

      if (tenantId !== ctx.companyId) return [];

      const q = query.trim();

      if (!q) return [];



      const perSourceLimit = Math.max(5, Math.ceil(limit / 4));



      const [customers, leads, companies, contacts, tags, files, activities, customFields] = await Promise.all([

        customerRead.search(tenantId, q, perSourceLimit),

        leadRead.search(tenantId, q, perSourceLimit),

        searchCompanies(client, tenantId, q, perSourceLimit, ctx),

        entityPorts?.entityContactRead.search(tenantId, q, perSourceLimit) ?? Promise.resolve([]),

        entityPorts?.entityTagRead.search(tenantId, q, perSourceLimit) ?? Promise.resolve([]),

        entityPorts?.entityFileRead.search(tenantId, q, perSourceLimit) ?? Promise.resolve([]),

        entityPorts?.entityActivityRead.search(tenantId, q, perSourceLimit) ?? Promise.resolve([]),

        entityPorts?.entityCustomFieldRead.search(tenantId, q, perSourceLimit) ?? Promise.resolve([]),

      ]);



      const results: GlobalSearchResultModel[] = [

        ...customers.map((customer) =>

          Object.freeze({

            id: customer.id,

            type: "customer",

            title: customer.displayName,

            subtitle: customer.email ?? customer.phone ?? "",

            preview: customer.phone ?? customer.email ?? "",

            score: scoreMatch(customer.displayName, q),

          }),

        ),

        ...leads.map((lead) =>

          Object.freeze({

            id: lead.id,

            type: "lead",

            title: lead.name,

            subtitle: lead.lifecycleStatus,

            preview: lead.source ?? "",

            score: scoreMatch(lead.name, q),

          }),

        ),

        ...companies,

        ...contacts.map((contact) =>

          Object.freeze({

            id: contact.id,

            type: "contact",

            title: contact.displayName,

            subtitle: contact.contactType,

            preview: contact.notes ?? contact.entityType,

            score: scoreMatch(contact.displayName, q),

          }),

        ),

        ...tags.map((tag) =>

          Object.freeze({

            id: tag.id,

            type: "tag",

            title: tag.name,

            subtitle: tag.category ?? "Tag",

            preview: tag.description ?? "",

            score: scoreMatch(tag.name, q),

          }),

        ),

        ...files.map((file) =>

          Object.freeze({

            id: file.id,

            type: "file",

            title: file.fileName,

            subtitle: file.mimeType,

            preview: file.category ?? file.entityType,

            score: scoreMatch(file.fileName, q),

          }),

        ),

        ...activities.map((activity) =>

          Object.freeze({

            id: activity.id,

            type: "activity",

            title: activity.subject,

            subtitle: activity.channel,

            preview: activity.preview ?? "",

            score: scoreMatch(activity.subject, q),

          }),

        ),

        ...customFields.map((field) =>

          Object.freeze({

            id: field.id,

            type: "custom_field",

            title: field.label,

            subtitle: field.fieldType,

            preview: field.fieldKey,

            score: scoreMatch(field.label, q),

          }),

        ),

      ];



      return results.sort((a, b) => b.score - a.score).slice(0, limit);

    },

  };

}



async function searchCompanies(

  client: SupabaseClient,

  tenantId: string,

  query: string,

  limit: number,

  ctx: LoginAppPortContext,

): Promise<GlobalSearchResultModel[]> {

  if (!ctx.hasPermission("companies.view")) return [];



  const { data, error } = await client

    .from("companies")

    .select("id, name")

    .eq("id", tenantId)

    .ilike("name", `%${query}%`)

    .limit(limit);



  if (error) return [];



  return (data ?? []).map((row) =>

    Object.freeze({

      id: String(row.id),

      type: "company",

      title: String(row.name ?? "Company"),

      subtitle: "Company",

      preview: String(row.name ?? ""),

      score: scoreMatch(String(row.name ?? ""), query),

    }),

  );

}

