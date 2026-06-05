// Conversational TTS for the LMP Copilot.
// Tries Groq PlayAI first, falls back to Gemini TTS via Lovable AI gateway,
// and returns a JSON { fallback: true } when both fail so the client can use
// the browser's built-in speechSynthesis.
import { buildCorsHeaders, pickAllowedOrigin } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { logAiUsage, estimateTokens } from "../_shared/ai-usage.ts";


const DEFAULT_GROQ_VOICE = "Fritz-PlayAI";
const DEFAULT_GEMINI_VOICE = "Kore";

Deno.serve(async (req) => {
  const corsHeaders = {
    ...buildCorsHeaders(req),
    "Access-Control-Allow-Origin": pickAllowedOrigin(req),
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireAuth(req, corsHeaders);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const text = (body?.text ?? "").toString().trim();
    if (!text) {
      return new Response(JSON.stringify({ error: "text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const truncated = text.slice(0, 1500);
    const voiceId = (body?.voiceId ?? DEFAULT_GROQ_VOICE).toString();

    // ── Try Groq PlayAI ──────────────────────────────────────────────
    const groqKey = Deno.env.get("GROQ_API_KEY");
    if (groqKey) {
      const t0 = Date.now();
      try {
        const resp = await fetch("https://api.groq.com/openai/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "playai-tts",
            input: truncated,
            voice: voiceId,
            response_format: "wav",
          }),
        });
        if (resp.ok && resp.body) {
          logAiUsage({
            userId: auth.user.id, feature: "tts", model: "playai-tts",
            promptTokens: estimateTokens(truncated),
            latencyMs: Date.now() - t0, status: "ok",
            metadata: { provider: "groq", voice: voiceId, chars: truncated.length },
          });
          return new Response(resp.body, {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "audio/wav",
              "Cache-Control": "no-store",
            },
          });
        }
        const errText = await resp.text().catch(() => "");
        logAiUsage({
          userId: auth.user.id, feature: "tts", model: "playai-tts",
          promptTokens: estimateTokens(truncated),
          latencyMs: Date.now() - t0,
          status: resp.status === 429 ? "rate_limited" : "error",
          errorMessage: errText.slice(0, 200),
          metadata: { provider: "groq" },
        });
        console.warn(`[voice-speak] Groq ${resp.status}: ${errText.slice(0, 200)}`);
      } catch (err) {
        logAiUsage({
          userId: auth.user.id, feature: "tts", model: "playai-tts",
          latencyMs: Date.now() - t0, status: "error",
          errorMessage: (err as Error).message, metadata: { provider: "groq" },
        });
        console.warn(`[voice-speak] Groq error: ${(err as Error).message}`);
      }
    }

    // ── Fallback: Gemini TTS via Google API ──────────────────────────
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (geminiKey) {
      const t0 = Date.now();
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: truncated }] }],
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: DEFAULT_GEMINI_VOICE } } },
              },
            }),
          },
        );
        if (resp.ok) {
          const data = await resp.json();
          const audioB64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (audioB64) {
            const binary = atob(audioB64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            logAiUsage({
              userId: auth.user.id, feature: "tts", model: "gemini-2.5-flash-preview-tts",
              promptTokens: estimateTokens(truncated),
              latencyMs: Date.now() - t0, status: "ok",
              metadata: { provider: "gemini", voice: DEFAULT_GEMINI_VOICE, chars: truncated.length },
            });
            return new Response(bytes, {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "audio/wav", "Cache-Control": "no-store" },
            });
          }
        }
        const errText = await resp.text().catch(() => "");
        console.warn(`[voice-speak] Gemini ${resp.status}: ${errText.slice(0, 200)}`);
      } catch (err) {
        console.warn(`[voice-speak] Gemini error: ${(err as Error).message}`);
      }
    }

    // ── Both failed — let the client fall back to browser TTS ────────
    return new Response(JSON.stringify({ fallback: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
