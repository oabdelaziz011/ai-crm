export * from "./types/lifecycle-types.js";
export { conversationLifecycleEngine, ConversationLifecycleEngine } from "./engines/conversation-lifecycle-engine.js";
export {
  LIFECYCLE_TRANSITION_RULES,
  LIFECYCLE_FORBIDDEN_ACTIONS,
  listAllowedActions,
  listForbiddenActions,
  resolveTransitionTarget,
  isActionAllowed,
  buildTransitionMatrix,
} from "./engines/transition-rules.js";
export {
  resolveLifecycleState,
  readLifecycleOverlay,
  writeLifecycleOverlay,
  mapLifecycleActionToBackendHint,
  mapBackendStateToLifecycleLabel,
} from "./adapters/backend-state-adapter.js";
export {
  resolveConversationOwner,
  explainOwnership,
  isSameOwner,
  ownerKindLabel,
} from "./engines/ownership-engine.js";
export {
  assignConversation,
  acceptAssignment,
  rejectAssignment,
  getAssignmentHistory,
  getCurrentAssignment,
  pickRoundRobinAgent,
  pickSkillsBasedAgent,
  buildAssignmentMatrix,
} from "./engines/assignment-engine.js";
export {
  addEscalation,
  transitionEscalation,
  getActiveEscalation,
  getEscalationHistory,
  buildEscalationMatrix,
  canEscalationTransition,
} from "./engines/escalation-engine.js";
export {
  setAgentPresence,
  getAgentPresence,
  setAgentTyping,
  setAgentViewingConversation,
  setAgentOnline,
  setAgentOffline,
  listAgentsByPresence,
  listAgentsViewingConversation,
  buildPresenceStateMatrix,
  resetPresenceStore,
} from "./engines/presence-engine.js";
export {
  buildConversationTimeline,
  messageToTimelineEvent,
  assignmentToTimelineEvent,
  escalationToTimelineEvent,
  appendTimelineEvent,
} from "./engines/timeline-engine.js";
export {
  buildConversationHeader,
  assertHeaderConsistency,
} from "./engines/header-model.js";
export {
  LIFECYCLE_PERMISSION_CODES,
  CONVERSATION_LIFECYCLE_PERMISSIONS,
  canPerformLifecycleAction,
  canLinkCustomer,
  canCreateCustomer,
  filterAllowedActionsForRole,
  buildPermissionMatrix,
  inferLifecycleRole,
  permissionForLifecycleAction,
} from "./engines/lifecycle-permissions.js";
export {
  AI_LIFECYCLE_ACTIONS,
  validateAiLifecycleCommand,
  aiActionHumanLabel,
  buildAiParticipantMatrix,
} from "./engines/ai-lifecycle-participant.js";
export {
  conversationLifecycleCoordinator,
  ConversationLifecycleCoordinator,
  type CoordinatorInput,
  type LifecycleSnapshot,
} from "./coordinator/conversation-lifecycle-coordinator.js";
export {
  executeLifecycleTransition,
  canExecuteTransition,
  snapshotFromRecord,
} from "./integration/lifecycle-transition-executor.js";
export {
  migrateLifecycleMetadata,
  needsLifecycleMetadataMigration,
  buildMigratableLifecycleOverlay,
  isLifecycleMigrated,
} from "./integration/lifecycle-metadata-migration.js";
export {
  getOperationalProjection,
  isConversationEscalated,
  getActiveOperationalEscalation,
  type OperationalAssignmentRecord,
  type OperationalEscalationRecord,
} from "./integration/operational-projection.js";
export { ESCALATION_LEVELS, nextEscalationLevel } from "./integration/escalation-ui-utils.js";
export {
  executeBackendLifecycleHint,
  persistLifecycleMetadata,
  linkCustomerViaBackend,
} from "./adapters/backend-action-executor.js";
