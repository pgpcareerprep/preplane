export const EXECUTION_CHECKLIST_DEFS = [
  { id: "ck-mentor", label: "Mentor aligned", owner: "POC", sheetKey: "mentorAligned" },
  { id: "ck-prepdoc", label: "Prep doc shared", owner: "POC", sheetKey: "prepDocShared" },
  { id: "ck-assign", label: "Assignment review", owner: "Mentor", sheetKey: "assignmentReview" },
  { id: "ck-mock", label: "1:1 mock completed", owner: "Mentor", sheetKey: "mockDoneByPoc" },
] as const;

export type ChecklistSheetKey = (typeof EXECUTION_CHECKLIST_DEFS)[number]["sheetKey"];
