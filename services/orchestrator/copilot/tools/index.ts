import { TOOL_SCHEMAS } from "./schemas.ts";
import { executeTool as executeRuntimeTool } from "./runtime.ts";
import { ANALYZE_CV_SCHEMA, executeAnalyzeCv } from "./analyze_cv.ts";
import { LOG_SUBMISSION_SCHEMA, executeLogSubmission } from "./log_submission.ts";
import { CREATE_CASE_STUDY_SCHEMA, executeCreateCaseStudy } from "./create_case_study.ts";

export const TOOLS = [...TOOL_SCHEMAS, ANALYZE_CV_SCHEMA, LOG_SUBMISSION_SCHEMA, CREATE_CASE_STUDY_SCHEMA];

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  options: { confirmed?: boolean } = {},
): Promise<string> {
  if (name === "analyze_cv") return executeAnalyzeCv(args);
  if (name === "log_submission") {
    return executeLogSubmission(args, { confirmed: options.confirmed || args.confirmed === true });
  }
  if (name === "create_case_study") return executeCreateCaseStudy(args);
  return executeRuntimeTool(name, args, options);
}

export { TOOL_SCHEMAS } from "./schemas.ts";
export { executeAnalyzeCv, ANALYZE_CV_SCHEMA } from "./analyze_cv.ts";
export { executeLogSubmission, LOG_SUBMISSION_SCHEMA } from "./log_submission.ts";
export { executeCreateCaseStudy, CREATE_CASE_STUDY_SCHEMA } from "./create_case_study.ts";
