export class LeadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadError";
  }
}

export class LeadNotFoundError extends LeadError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = "LeadNotFoundError";
  }
}

export class LeadPermissionDeniedError extends LeadError {
  constructor(permission: string) {
    super(`Permission denied: ${permission}`);
    this.name = "LeadPermissionDeniedError";
  }
}

export class LeadValidationError extends LeadError {
  constructor(message: string) {
    super(message);
    this.name = "LeadValidationError";
  }
}

export class LeadConflictError extends LeadError {
  constructor(message: string) {
    super(message);
    this.name = "LeadConflictError";
  }
}

export class LeadStageTransitionError extends LeadError {
  readonly reason: string;

  constructor(from: string, to: string, reason = "transition_not_allowed") {
    super(`Invalid stage transition: ${from} → ${to} (${reason})`);
    this.name = "LeadStageTransitionError";
    this.reason = reason;
  }
}

/** Policy blocked qualification; CRM state was not changed. */
export class LeadQualificationPolicyRejectedError extends LeadError {
  readonly evaluation: {
    outcome: string;
    reason: string;
    explanation: string;
    missingRequiredEvidence: string[];
    requiresHumanReview: boolean;
  };

  constructor(evaluation: LeadQualificationPolicyRejectedError["evaluation"]) {
    super(
      `Qualification policy rejected (${evaluation.outcome}): ${evaluation.explanation}`,
    );
    this.name = "LeadQualificationPolicyRejectedError";
    this.evaluation = evaluation;
  }
}
