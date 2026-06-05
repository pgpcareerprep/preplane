// CSV templates + expected-column metadata for Data Sources upload modals.

export type ExpectedCol = { label: string; required: boolean };

export const MU_EXPECTED_COLS: ExpectedCol[] = [
  { label: "Mentor_Type", required: false },
  { label: "First_Name", required: true },
  { label: "Last_Name", required: true },
  { label: "Years_of_Experience", required: false },
  { label: "Designation", required: true },
  { label: "Company", required: true },
  { label: "Linkedin", required: false },
  { label: "Email", required: false },
  { label: "Mobile_Number", required: false },
  { label: "Functional_Domain", required: true },
  { label: "Industry", required: true },
  { label: "Expertise", required: true },
  { label: "Ratings", required: false },
  { label: "Rate", required: false },
  { label: "Currency", required: false },
];

export const ALU_EXPECTED_COLS: ExpectedCol[] = [
  { label: "Student Name", required: true },
  { label: "Cohort", required: false },
  { label: "LinkedIn profile", required: false },
  { label: "Industry", required: false },
  { label: "Domain 1", required: false },
  { label: "Domain 2", required: false },
  { label: "Current City", required: false },
  { label: "Current State", required: false },
  { label: "Location", required: false },
  { label: "Current Company", required: false },
  { label: "Current Role", required: false },
  { label: "Company 2", required: false },
  { label: "Role", required: false },
  { label: "Company 3", required: false },
  { label: "Company 4", required: false },
  { label: "Role", required: false },
  { label: "Company 5", required: false },
  { label: "Role", required: false },
  { label: "Company 6", required: false },
  { label: "Role", required: false },
];

export const MU_TEMPLATE_HEADERS = [
  "Mentor_Type","First_Name","Last_Name","Years_of_Experience","Designation","Company",
  "Linkedin","Email","Mobile_Number","Functional_Domain","Industry","Expertise",
  "Ratings","Rate","Currency",
];

export const ALU_TEMPLATE_HEADERS = [
  "Student Name","Cohort","LinkedIn profile","Industry","Domain 1","Domain 2",
  "Current City","Current State","Location","Current Company","Current Role",
  "Company 2","Role","Company 3","Company 4","Role","Company 5","Role","Company 6","Role",
];

export const STU_EXPECTED_COLS: ExpectedCol[] = [
  { label: "Student ID", required: true },
  { label: "Student Name", required: true },
  { label: "Student Email ID", required: true },
  { label: "Primary Domain", required: true },
  { label: "Secondary Domain", required: false },
  { label: "Program Name", required: false },
  { label: "Placement Status", required: false },
  { label: "Phone", required: false },
];

export const STU_TEMPLATE_HEADERS = [
  "Student ID","Student Name","Student Email ID","Primary Domain","Secondary Domain","Program Name","Placement Status","Phone",
];

export const POC_EXPECTED_COLS: ExpectedCol[] = [
  { label: "Name", required: true },
  { label: "Email", required: false },
  { label: "Role", required: true },
  { label: "Primary Domain", required: false },
  { label: "Supported Domains", required: false },
  { label: "Status", required: false },
  { label: "Max Threshold", required: false },
];

export const POC_TEMPLATE_HEADERS = [
  "Name","Email","Role","Primary Domain","Supported Domains","Status","Max Threshold",
];

export function downloadCsvTemplate(headers: string[], filename: string) {
  const blob = new Blob([headers.join(",") + "\n"], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
