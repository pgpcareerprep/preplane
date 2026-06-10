export type SessionStatus =
  | "scheduled"
  | "completed"
  | "no-show"
  | "rescheduled"
  | "feedback-pending"
  | "closed";

export type Person = { name: string; initials: string; color: string; role?: string; company?: string };

export type Session = {
  id: string;
  reqId: string;
  mentor: Person;
  candidate: Person;
  date: string; // ISO
  dateLabel: string;
  round: string;
  status: SessionStatus;
  pocFeedbackSubmitted?: boolean;
  studentFeedbackSubmitted?: boolean;
  studentToken?: string;
  tokenRegenerated?: boolean;
  notes?: string;
  groupId?: string;
  groupSize?: number;
};


export const STATUS_META: Record<SessionStatus, { label: string; chip: string; pulse?: boolean }> = {
  "scheduled":         { label: "Scheduled",        chip: "bg-teal-50 text-teal-600 border-teal-200" },
  "completed":         { label: "Completed",        chip: "bg-sage-50 text-sage-600 border-sage-200" },
  "no-show":           { label: "No-show",          chip: "bg-coral-50 text-coral-600 border-coral-200" },
  "rescheduled":       { label: "Rescheduled",      chip: "bg-yellow-50 text-yellow-600 border-yellow-200" },
  "feedback-pending":  { label: "Feedback Pending", chip: "bg-orange-50 text-orange-600 border-orange-200", pulse: true },
  "closed":            { label: "Closed",           chip: "bg-n100 text-n500 border-n200" },
};
