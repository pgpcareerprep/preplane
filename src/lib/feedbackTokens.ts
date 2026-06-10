import { supabase } from "@/integrations/supabase/client";

/** Rotate and return a short-lived public feedback link token. */
export async function issueSessionFeedbackToken(sessionId: string): Promise<string> {
  const { data, error } = await supabase.rpc("issue_session_feedback_token" as never, {
    p_session_id: sessionId,
  } as never);
  if (error) throw error;
  if (typeof data !== "string" || !data) throw new Error("Feedback token issuance failed");
  return data;
}

export async function copySessionFeedbackLink(sessionId: string): Promise<string> {
  const token = await issueSessionFeedbackToken(sessionId);
  const link = `${window.location.origin}/feedback/${token}`;
  await navigator.clipboard.writeText(link);
  return link;
}
