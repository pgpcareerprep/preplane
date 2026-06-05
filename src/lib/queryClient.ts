import { QueryClient } from "@tanstack/react-query";

// Shared singleton so non-hook code (e.g. mutation helpers in lmpExecution)
// can invalidate queries.
export const queryClient = new QueryClient();
