import type { JourneyStepDefinition, JourneyStepState } from "../types/intelligence-types.js";

const CLINIC_JOURNEY: JourneyStepDefinition[] = [
  { id: "ad", labelKey: "journey.ad", icon: "Megaphone" },
  { id: "lead", labelKey: "journey.lead", icon: "UserPlus" },
  { id: "qualified", labelKey: "journey.qualified", icon: "CheckCircle" },
  { id: "customer", labelKey: "journey.customer", icon: "User" },
  { id: "appointment", labelKey: "journey.appointment", icon: "Calendar" },
  { id: "deposit", labelKey: "journey.deposit", icon: "CreditCard" },
  { id: "waiting", labelKey: "journey.waiting", icon: "Clock" },
  { id: "doctor", labelKey: "journey.doctor", icon: "Stethoscope" },
  { id: "completed", labelKey: "journey.completed", icon: "CheckCheck" },
];

const HR_JOURNEY: JourneyStepDefinition[] = [
  { id: "website", labelKey: "journey.website", icon: "Globe" },
  { id: "candidate", labelKey: "journey.candidate", icon: "User" },
  { id: "interview", labelKey: "journey.interview", icon: "Video" },
  { id: "offer", labelKey: "journey.offer", icon: "FileText" },
  { id: "hired", labelKey: "journey.hired", icon: "BadgeCheck" },
];

const TRAINING_JOURNEY: JourneyStepDefinition[] = [
  { id: "inquiry", labelKey: "journey.inquiry", icon: "MessageCircle" },
  { id: "student", labelKey: "journey.student", icon: "GraduationCap" },
  { id: "enrolled", labelKey: "journey.enrolled", icon: "BookOpen" },
  { id: "session", labelKey: "journey.session", icon: "Calendar" },
  { id: "completed", labelKey: "journey.completed", icon: "Award" },
];

const JOURNEY_BY_TEMPLATE: Record<string, JourneyStepDefinition[]> = {
  clinic: CLINIC_JOURNEY,
  training_center: TRAINING_JOURNEY,
  automotive: CLINIC_JOURNEY,
  hr: HR_JOURNEY,
  default: CLINIC_JOURNEY,
};

const CURRENT_STEP_BY_TEMPLATE: Record<string, string> = {
  clinic: "doctor",
  training_center: "session",
  automotive: "waiting",
  hr: "interview",
  default: "waiting",
};

const LABELS: Record<string, string> = {
  "journey.ad": "Facebook Ad",
  "journey.lead": "Lead",
  "journey.qualified": "Qualified",
  "journey.customer": "Customer",
  "journey.appointment": "Appointment",
  "journey.deposit": "Deposit Paid",
  "journey.waiting": "Waiting",
  "journey.doctor": "Doctor",
  "journey.completed": "Completed",
  "journey.website": "Website",
  "journey.candidate": "Candidate",
  "journey.interview": "Interview",
  "journey.offer": "Offer",
  "journey.hired": "Hired",
  "journey.inquiry": "Inquiry",
  "journey.student": "Student",
  "journey.enrolled": "Enrolled",
  "journey.session": "Session",
};

export class ContextEngine {
  buildJourney(templateKey: string): JourneyStepState[] {
    const steps = JOURNEY_BY_TEMPLATE[templateKey] ?? JOURNEY_BY_TEMPLATE.default!;
    const currentId = CURRENT_STEP_BY_TEMPLATE[templateKey] ?? "waiting";
    let passedCurrent = false;

    return steps.map((step) => {
      if (step.id === currentId) {
        passedCurrent = true;
        return { id: step.id, label: LABELS[step.labelKey] ?? step.id, icon: step.icon, status: "current" as const };
      }
      if (!passedCurrent) {
        return { id: step.id, label: LABELS[step.labelKey] ?? step.id, icon: step.icon, status: "completed" as const };
      }
      return { id: step.id, label: LABELS[step.labelKey] ?? step.id, icon: step.icon, status: "upcoming" as const };
    });
  }
}

export const contextEngine = new ContextEngine();
