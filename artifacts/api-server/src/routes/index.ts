import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import emailRouter from "./email.js";
import whatsappRouter from "./whatsapp.js";
import whatsappEmbeddedSignupRouter from "./whatsapp-embedded-signup.js";
import instagramRouter from "./instagram.js";
import messengerRouter from "./messenger.js";
import smsRouter from "./sms.js";
import emailChannelRouter from "./email-channel.js";
import emailMailboxProviderRouter from "./email-mailbox-provider.js";
import emailAiDraftRouter from "./email-ai-draft.js";
import emailMessageTranslateRouter from "./email-message-translate.js";
import emailComposeSessionRouter from "./email-compose-session.js";
import emailWorkspaceChannelRouter from "./email-workspace-channel.js";
import ticketResolutionAiDraftRouter from "./ticket-resolution-ai-draft.js";
import omnichannelRouter from "./omnichannel.js";
import v1Router from "./v1/index.js";
import internalBillingRouter from "./internal-billing.js";
import billingSaasRouter from "./billing-saas.js";
import platformAiRouter from "./platform-ai.js";
import quotesSendRouter from "./quotes-send.js";
import salesFollowUpStatusRouter from "./sales-follow-up-status.js";
import salesFollowUpApprovalRouter from "./sales-follow-up-approval.js";
import salesCompleteDemoRouter from "./sales-complete-demo.js";
import productDemosRouter from "./product-demos.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(salesFollowUpStatusRouter);
router.use(salesFollowUpApprovalRouter);
router.use(salesCompleteDemoRouter);
router.use(productDemosRouter);
router.use(authRouter);
// Mount before channel routers that apply global requireCompanyScope — those
// middleware stacks run for every unmatched request and would reject checkout
// bodies that intentionally omit companyId (JWT company is authoritative).
router.use("/billing/saas", billingSaasRouter);
router.use("/internal/billing", internalBillingRouter);
router.use("/quotes", quotesSendRouter);
router.use(emailRouter);
router.use(whatsappRouter);
router.use(whatsappEmbeddedSignupRouter);
router.use(instagramRouter);
router.use(messengerRouter);
router.use(smsRouter);
router.use(emailChannelRouter);
router.use(emailMailboxProviderRouter);
router.use(emailAiDraftRouter);
router.use(emailMessageTranslateRouter);
router.use(emailComposeSessionRouter);
router.use(emailWorkspaceChannelRouter);
router.use(ticketResolutionAiDraftRouter);
router.use(omnichannelRouter);
router.use("/platform-ai", platformAiRouter);
router.use("/v1", v1Router);

export default router;
