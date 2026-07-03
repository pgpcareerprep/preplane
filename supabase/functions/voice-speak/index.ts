// Conversational TTS for the LMP Copilot.
// Tries Gemini TTS; returns JSON { fallback: true } on failure so the client
// can use the browser's built-in speechSynthesis.
import { buildCorsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { logAiUsage, estimateTokens } from "../_shared/ai-usage.ts";
import { loadSecret } from "../_shared/providers/secrets.ts";

const DEFAULT_GEMINI_VOICE = "Aoede";
const TTS_MODELS = ["gemini-2.5-pro-preview-tts", "gemini-2.5-flash-preview-tts"] as const;
const TTS_STYLE_PREFIX =
  "Say the following in a warm, natural, conversational tone, like a friendly colleague speaking casually — natural pacing, brief pauses at commas, no robotic cadence: ";

// Build a valid WAV file from raw PCM bytes (24 kHz, 16-bit, mono, little-endian).
function pcmToWav(pcmBytes: Uint8Array): Uint8Array {
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBytes.length;
  const headerSize = 44;
  const buf = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buf);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);          // PCM chunk size
  view.setUint16(20, 1, true);           // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  new Uint8Array(buf).set(pcmBytes, headerSize);
  return new Uint8Array(buf);
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
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
    const truncated = text.slice(0, 600);
    const requestedVoice = (body?.voiceId ?? "").toString().trim();
    const voiceName = /^[A-Za-z]{2,24}$/.test(requestedVoice) ? requestedVoice : DEFAULT_GEMINI_VOICE;
    const prompt = `${TTS_STYLE_PREFIX}${truncated}`;

    // ── Try: Gemini TTS ──────────────────────────────────────────────
    const geminiKey = await loadSecret("GEMINI_API_KEY");
    if (geminiKey) {
      const t0 = Date.now();
      for (const model of TTS_MODELS) {
        try {
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  responseModalities: ["AUDIO"],
                  speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
                },
              }),
            },
          );
          if (resp.ok) {
            const data = await resp.json();
            const part = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
            const audioB64 = part?.data;
            if (audioB64) {
              const binary = atob(audioB64);
              const pcm = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) pcm[i] = binary.charCodeAt(i);
              // Wrap raw PCM in a valid WAV container so browsers can play it.
              const wav = pcmToWav(pcm);
              logAiUsage({
                userId: auth.user.id, feature: "tts", model,
                promptTokens: estimateTokens(prompt),
                latencyMs: Date.now() - t0, status: "ok",
                metadata: { provider: "gemini", voice: voiceName, chars: truncated.length },
              });
              return new Response(wav, {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "audio/wav", "Cache-Control": "no-store" },
              });
            }
          }
          const errText = await resp.text().catch(() => "");
          console.warn(`[voice-speak] Gemini ${model} ${resp.status}: ${errText.slice(0, 200)}`);
          if (resp.status === 404 || resp.status === 429) continue;
          break;
        } catch (err) {
          console.warn(`[voice-speak] Gemini ${model} error: ${(err as Error).message}`);
          break;
        }
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
