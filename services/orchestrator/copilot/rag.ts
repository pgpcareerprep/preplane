import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getEnv } from "./secrets.ts";
import { EMBED_URL } from "./constants.ts";

type SupabaseLike = ReturnType<typeof createClient>;

export async function retrieveRAGContext(
  userMessage: string,
  sb: SupabaseLike,
  filterTables?: string[] | null,
  opts?: { limit?: number; threshold?: number; userId?: string | null },
): Promise<string> {
  try {
    const key = getEnv("GEMINI_API_KEY");
    if (!key || !userMessage || !userMessage.trim()) return "";
    const limit = opts?.limit ?? 6;
    const threshold = opts?.threshold ?? 0.68;
    const requestingUserId = opts?.userId ?? null;

    const embedRes = await fetch(`${EMBED_URL}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        content: { parts: [{ text: userMessage.slice(0, 2000) }] },
        taskType: "RETRIEVAL_QUERY",
      }),
    });
    if (!embedRes.ok) return "";
    const embedData = await embedRes.json();
    const queryEmbedding = embedData?.embedding?.values as number[] | undefined;
    if (!queryEmbedding) return "";

    const { data: results } = await sb.rpc("rag_search", {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: threshold,
      match_count: limit,
      filter_tables: filterTables ?? null,
      requesting_user_id: requestingUserId,
    });

    const rows = (results ?? []) as Array<{ source_table: string; content: string; similarity: number }>;
    if (!rows.length) return "";

    const contextBlocks = rows
      .map((r, i) => `[${i + 1}] Source: ${r.source_table} (similarity: ${(r.similarity * 100).toFixed(0)}%)\n${r.content}`)
      .join("\n\n---\n\n");

    return `\n\n## SEMANTICALLY RELEVANT RECORDS FROM DATABASE\nThe following records were retrieved by vector similarity to the user's message. Use them as grounding context — cite specifics, do NOT invent details not present here.\n\n${contextBlocks}\n\n---\n`;
  } catch (e) {
    console.warn("RAG retrieval failed (non-fatal):", e);
    return "";
  }
}
