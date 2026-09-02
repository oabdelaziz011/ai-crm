import { ValidationError } from "../../errors.js";
import {
  buildActionVariableScope,
  resolveFieldBindingAsString,
  resolveRequiredFieldBindingAsString,
} from "../../field-binding/resolver.js";
import { buildCustomerEntityFields } from "../../crm/lookup/output-variables.js";
import type { CustomerServicePort } from "../../ports/customer-service-port.js";
import type { ConversationCustomerLinkPort } from "../../ports/conversation-customer-link-port.js";
import type { ExecutionContext, NodeExecutionResult } from "../execution-context.js";
import { mergeVariables } from "../execution-context.js";
import { resolveInboxConversationId } from "../../runtime/resolve-inbox-conversation-id.js";
import {
  isImportPhoneWritable,
  resolveImportPhoneIdentity,
} from "@workspace/ai-tool-router";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseOptionalAge(value: string | null | undefined): number | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const normalized = trimmed
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - "٠".charCodeAt(0)))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - "۰".charCodeAt(0)));
  const parsed = Number.parseInt(normalized, 10);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 150) return null;
  return parsed;
}

function resolveActorUserId(context: ExecutionContext): string {
  const candidates = [
    context.run.metadata?.actorUserId,
    context.session.metadata?.actorUserId,
    context.variables.__actorUserId,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

function readVariableByKey(scope: Record<string, unknown>, key: string): string {
  const direct = scope[key];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  return resolveFieldBindingAsString({ mode: "variable", variable: `{{${key}}}` }, scope);
}

function readCustomerId(scope: Record<string, unknown>): string {
  const customer = scope.customer;
  if (customer && typeof customer === "object" && !Array.isArray(customer)) {
    const id = (customer as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return readVariableByKey(scope, "customer.id");
}

function buildCustomerVariables(customer: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  age: number | null;
  gender: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}) {
  return buildCustomerEntityFields({
    exists: true,
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    age: customer.age,
    gender: customer.gender,
    notes: customer.notes,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  });
}

export async function executeCreateCustomerAction(
  context: ExecutionContext,
  config: Record<string, unknown>,
  customerService: CustomerServicePort,
  conversationCustomerLink?: ConversationCustomerLinkPort,
): Promise<NodeExecutionResult> {
  const scope = buildActionVariableScope(context.variables, context.customer.id);
  const nameField = readString(config.nameField) ?? "customer_name";
  const emailField = readString(config.emailField);
  const phoneField = readString(config.phoneField) ?? "customer_phone";
  const ageField = readString(config.ageField);
  const genderField = readString(config.genderField);

  const name = readVariableByKey(scope, nameField);
  if (!name) {
    throw new ValidationError(`Create customer requires ${nameField}.`);
  }

  const ageRaw = ageField ? readVariableByKey(scope, ageField) || null : null;
  const genderRaw = genderField ? readVariableByKey(scope, genderField) || null : null;

  const phoneFieldKey = phoneField ? phoneField : "customer_phone";
  const phone = phoneField ? readVariableByKey(scope, phoneFieldKey) || null : null;
  const regionField = readString(config.regionField) ?? readString(config.phoneRegionField);
  const region = regionField
    ? readVariableByKey(scope, regionField) || null
    : readString(config.defaultRegion) ?? readString(config.phoneRegion) ?? null;

  const phonePreview = resolveImportPhoneIdentity({
    phone,
    rowRegion: region,
    source: "explicit",
  });
  if (phone && !isImportPhoneWritable(phonePreview)) {
    if (phonePreview.code === "phone_region_required") {
      throw new ValidationError(
        "PHONE_REGION_REQUIRED: Local phone numbers require an explicit ISO-2 region (config.regionField / defaultRegion) or E.164.",
      );
    }
    if (phonePreview.code === "ambiguous_phone") {
      throw new ValidationError("AMBIGUOUS_PHONE: Phone number is ambiguous without an explicit region.");
    }
    throw new ValidationError("INVALID_PHONE: Phone number could not be resolved.");
  }

  const result = await customerService.createCustomer({
    companyId: context.company.id,
    userId: resolveActorUserId(context),
    name,
    email: emailField ? readVariableByKey(scope, emailField) || null : null,
    phone,
    age: parseOptionalAge(ageRaw),
    gender: genderRaw?.trim() || null,
    phoneIdentity: phonePreview.identity ?? undefined,
  });

  const conversationId = resolveInboxConversationId(context.variables);
  if (conversationCustomerLink && conversationId) {
    await conversationCustomerLink.linkCustomerToConversation({
      companyId: context.company.id,
      conversationId,
      customerId: result.customer.id,
      automationSessionId: context.session.id,
    });
  }

  return {
    outcome: "continue",
    variables: mergeVariables(context.variables, buildCustomerVariables(result.customer)),
    output: { customerId: result.customer.id },
  };
}

export async function executeUpdateCustomerAction(
  context: ExecutionContext,
  config: Record<string, unknown>,
  customerService: CustomerServicePort,
): Promise<NodeExecutionResult> {
  const scope = buildActionVariableScope(context.variables, context.customer.id);
  const field = readString(config.field);
  if (!field) throw new ValidationError("Update customer requires config.field.");

  const customerId = readCustomerId(scope);
  if (!customerId) throw new ValidationError("Update customer requires customer.id from Find Customer.");

  const valueBinding = config.value;
  const value =
    typeof valueBinding === "object" && valueBinding !== null && "mode" in (valueBinding as object)
      ? resolveRequiredFieldBindingAsString(valueBinding, scope, "value")
      : readString(config.value) ?? readVariableByKey(scope, field);

  let phoneIdentity = undefined as
    | ReturnType<typeof resolveImportPhoneIdentity>["identity"]
    | undefined;
  if (field === "phone") {
    const regionField = readString(config.regionField) ?? readString(config.phoneRegionField);
    const region = regionField
      ? readVariableByKey(scope, regionField) || null
      : readString(config.defaultRegion) ?? readString(config.phoneRegion) ?? null;
    const phonePreview = resolveImportPhoneIdentity({
      phone: value,
      rowRegion: region,
      source: "explicit",
    });
    if (!isImportPhoneWritable(phonePreview) || !phonePreview.identity) {
      if (phonePreview.code === "phone_region_required") {
        throw new ValidationError(
          "PHONE_REGION_REQUIRED: Local phone numbers require an explicit ISO-2 region or E.164.",
        );
      }
      if (phonePreview.code === "ambiguous_phone") {
        throw new ValidationError("AMBIGUOUS_PHONE: Phone number is ambiguous without an explicit region.");
      }
      throw new ValidationError("INVALID_PHONE: Phone number could not be resolved.");
    }
    phoneIdentity = phonePreview.identity;
  }

  const result = await customerService.updateCustomer({
    companyId: context.company.id,
    userId: resolveActorUserId(context),
    customerId,
    field,
    value,
    phoneIdentity: phoneIdentity ?? undefined,
  });

  return {
    outcome: "continue",
    variables: mergeVariables(context.variables, buildCustomerVariables(result.customer)),
    output: { customerId: result.customer.id, field },
  };
}
