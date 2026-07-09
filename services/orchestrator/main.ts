import { buildCorsHeaders } from "../../supabase/functions/_shared/cors.ts";
import { createRequestState, requestStateStorage } from "./copilot/requestContext.ts";
import { handleChatRequest } from "./copilot/chat_handler.ts";
import { handleVoiceRequest } from "./voice_handler.ts";

const port = Number(Deno.env.get("ORCHESTRATOR_PORT") || Deno.env.get("PORT") || "9005");

function jsonError(status: number, message: string, req: Request): Response {
  const cors = buildCorsHeaders(req);
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function route(req: Request): Promise<Response> {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname === "/health") {
    return new Response(JSON.stringify({ status: "ok", service: "orchestrator" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed", req);
  }

  if (url.pathname === "/chat" || url.pathname === "/copilot") {
    return requestStateStorage.run(createRequestState(req), () => handleChatRequest(req));
  }

  if (url.pathname === "/voice") {
    return handleVoiceRequest(req);
  }

  return jsonError(404, "Not found", req);
}

console.log(`[orchestrator] listening on :${port}`);
Deno.serve({ port, hostname: "0.0.0.0" }, route);
