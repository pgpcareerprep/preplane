import { type LmpStatus } from "./lmpTypes";

export type TimelineKind = "create" | "poc" | "cv" | "rounds" | "round-move" | "match" | "status";

export type TimelineEvent = {
  id: string;
  kind: TimelineKind;
  date: string;
  text: string;
  author?: string;
};

export type Remark = {
  id: string;
  author: string;
  initials: string;
  avatarColor: string;
  role: "Allocator" | "POC" | "Admin";
  timestamp: string;
  text: string;
  replies?: Remark[];
};

export type LmpCandidate = {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  round: string;
};

export type LmpSession = {
  id: string;
  mentor: string;
  candidate: string;
  status: "Scheduled" | "Completed" | "Cancelled";
};


export const STATUS_OPTIONS: LmpStatus[] = [
  "not-started",
  "ongoing",
  "dormant",
  "hold",
  "closed",
  "converted",
  "not-converted",
  "converted-na",
];

export const TIMELINE_DOT: Record<TimelineKind, string> = {
  create: "bg-orange-500",
  poc: "bg-orange-500",
  cv: "bg-n400",
  rounds: "bg-n400",
  "round-move": "bg-teal-400",
  match: "bg-plum-400",
  status: "bg-yellow-500",
};