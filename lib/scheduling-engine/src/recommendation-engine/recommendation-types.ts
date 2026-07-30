export type RecommendationBranchContext = {
  branchId: string;
  branchName: string;
  isPrimary: boolean;
  priority: number;
};

export type RecommendationResourceContext = {
  resourceId: string;
  resourceName: string;
  branchId: string | null;
  branchName: string | null;
  capacity: number;
};

export type RecommendationPreferences = {
  resourceId?: string;
  branchId?: string;
  date?: string;
  time?: string;
};

export type RecommendationScoreFactors = {
  sameResource: number;
  sameDay: number;
  sameBranch: number;
  preferredHours: number;
  branchChange: number;
  resourceChange: number;
  proximity: number;
  capacity: number;
  scheduleFit: number;
};

export type AppointmentRecommendation = {
  score: number;
  reason: string;
  resourceId: string;
  resourceName: string;
  branchId: string | null;
  branchName: string | null;
  date: string;
  start: string;
  end: string;
  displayTime: string;
  durationMinutes: number;
  capacity: number;
  timezone: string;
  factors: RecommendationScoreFactors;
};

export type AlternativeResourceRecommendation = {
  requestedResource: { id: string; name: string };
  recommendedResource: { id: string; name: string };
  reason: string;
  earliestSlot: {
    date: string;
    start: string;
    end: string;
    branchId: string | null;
    branchName: string | null;
  };
};

export type AlternativeBranchRecommendation = {
  requestedBranch: { id: string; name: string };
  suggestedBranch: { id: string; name: string };
  distance: number | null;
  earliestSlot: {
    date: string;
    start: string;
    end: string;
    resourceId: string;
    resourceName: string;
  };
};

export type NearestDateRecommendation = {
  requestedDate: string;
  nearestDate: string;
  resourceId: string;
  resourceName: string;
  branchId: string | null;
  branchName: string | null;
  start: string;
  end: string;
  reason: string;
};

export type RecommendAppointmentsInput = {
  companyId: string;
  serviceId: string;
  durationMinutes: number;
  resources: RecommendationResourceContext[];
  branches: RecommendationBranchContext[];
  startDate: string;
  daysAhead?: number;
  timezone: string;
  maxBookingWindowDays?: number;
  referenceNow?: Date;
  preferences?: RecommendationPreferences;
  limit?: number;
};

export type RecommendAppointmentsResult = {
  success: boolean;
  searchedWindow: number;
  recommendations: AppointmentRecommendation[];
  alternativeResource: AlternativeResourceRecommendation | null;
  alternativeBranch: AlternativeBranchRecommendation | null;
  nearestDate: NearestDateRecommendation | null;
  message?: string;
  nextSuggestion?: number | null;
};

export type RecommendationCandidate = {
  resourceId: string;
  resourceName: string;
  branchId: string | null;
  branchName: string | null;
  capacity: number;
  durationMinutes: number;
  date: string;
  start: string;
  end: string;
  timezone: string;
  slotIndex: number;
  slotsOnDate: number;
};
