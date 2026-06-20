import { TOOL_SCHEMAS } from "./schemas.ts";
import { executeTool as executeRuntimeTool } from "./runtime.ts";
import { ANALYZE_CV_SCHEMA, executeAnalyzeCv } from "./analyze_cv.ts";

export const TOOLS = [...TOOL_SCHEMAS, ANALYZE_CV_SCHEMA];

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  options: { confirmed?: boolean } = {},
): Promise<string> {
  if (name === "analyze_cv") return executeAnalyzeCv(args);
  return executeRuntimeTool(name, args, options);
}

export { TOOL_SCHEMAS } from "./schemas.ts";
export { executeAnalyzeCv, ANALYZE_CV_SCHEMA } from "./analyze_cv.ts";
