export * from "./types";
export { renderEmailTemplate } from "./email-template-renderer";
export { emailTemplateRepository, EmailTemplateRepository } from "./email-template-repository";
export {
  buildEmailWorkspaceTemplateRenderContext,
  buildTrustedCompanyTemplateContext,
  findUnresolvedTemplateTokensAfterCompanyResolution,
  isResolvableCompanyTemplateToken,
  resolveCompanyTemplateVariablesInComposerContent,
  resolveCompanyTemplateVariablesInText,
  resolveTrustedCompanyNameForEmailTemplates,
} from "./email-template-company-context";
export {
  sendEmailTemplate,
  SendEmailTemplateError,
  isValidTestRecipientEmail,
  textToSafeEmailHtml,
} from "./send-email-template";
export {
  classifyEmailTemplateCategory,
  EMAIL_TEMPLATE_CATEGORY_DEFS,
  type EmailTemplateCategoryId,
} from "./email-template-categories";
export {
  RECOMMENDED_EMAIL_TEMPLATES,
  recommendedTemplatesForCategory,
  type RecommendedEmailTemplate,
} from "./email-recommended-templates";
