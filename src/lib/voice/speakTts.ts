import { supabase } from "@/integrations/supabase/client";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { voiceSpeakUrl } from "@/lib/copilotGateway";

const SPEAK_URL = voiceSpeakUrl();

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let queueToken = 0;

export function stopSpeaking() {
  queueToken += 1;
  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
    }
  } catch { /* noop */ }
  if (currentUrl) {
    try { URL.revokeObjectURL(currentUrl); } catch { /* noop */ }
    currentUrl = null;
  }
  currentAudio = null;
  try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
}

function speakBrowser(text: string, opts?: { onStart?: () => void; onEnd?: () => void }): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      opts?.onStart?.(); opts?.onEnd?.(); resolve(); return;
    }
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05; u.lang = "en-US";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      opts?.onEnd?.();
      resolve();
    };
    const estimatedMs = Math.max(3000, (text.length / 15) * 1000 + 1000);
    const fallbackTimer = window.setTimeout(finish, estimatedMs);
    u.onstart = () => opts?.onStart?.();
    u.onend = () => { window.clearTimeout(fallbackTimer); finish(); };
    u.onerror = () => { window.clearTimeout(fallbackTimer); finish(); };
    try { window.speechSynthesis.speak(u); } catch { window.clearTimeout(fallbackTimer); finish(); }
  });
}

function splitForTts(text: string, maxLen = 220): string[] {
  if (text.length <= maxLen) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let buf = "";
  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (!piece) continue;
    const candidate = buf ? `${buf} ${piece}` : piece;
    if (candidate.length <= maxLen) {
      buf = candidate;
      continue;
    }
    if (buf) chunks.push(buf);
    if (piece.length <= maxLen) {
      buf = piece;
    } else {
      for (let i = 0; i < piece.length; i += maxLen) {
        chunks.push(piece.slice(i, i + maxLen));
      }
      buf = "";
    }
  }
  if (buf) chunks.push(buf);
  return chunks.length > 0 ? chunks : [text.slice(0, maxLen)];
}

async function speakChunk(
  text: string,
  opts?: { voiceId?: string; onStart?: () => void; onEnd?: () => void },
): Promise<"audio" | "browser"> {
  let resp: Response;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    resp = await fetchWithTimeout(SPEAK_URL, {
      method: "POST",
      timeoutMs: 15_000,
      timeoutLabel: "Voice speak",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ text, voiceId: opts?.voiceId }),
    });
  } catch {
    await speakBrowser(text, opts);
    return "browser";
  }
  if (!resp.ok) {
    try { await resp.text(); } catch { /* noop */ }
    await speakBrowser(text, opts);
    return "browser";
  }

  const contentType = resp.headers.get("Content-Type") || "";
  if (!contentType.includes("audio")) {
    try { await resp.text(); } catch { /* noop */ }
    await speakBrowser(text, opts);
    return "browser";
  }

  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  currentUrl = url;

  await new Promise<void>((resolve) => {
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onplay = () => opts?.onStart?.();
    audio.onended = () => {
      opts?.onEnd?.();
      if (currentUrl === url) { URL.revokeObjectURL(url); currentUrl = null; }
      if (currentAudio === audio) currentAudio = null;
      resolve();
    };
    audio.onerror = () => {
      if (currentUrl === url) { URL.revokeObjectURL(url); currentUrl = null; }
      if (currentAudio === audio) currentAudio = null;
      speakBrowser(text, opts).then(() => resolve());
    };
    audio.play().catch(() => speakBrowser(text, opts).then(() => resolve()));
  });
  return "audio";
}

/**
 * Speaks text using the voice-speak edge function (Gemini TTS) → browser speechSynthesis fallback.
 * New calls cancel previous playback.
 */
export async function speak(
  text: string,
  opts?: { voiceId?: string; onStart?: () => void; onEnd?: () => void },
): Promise<void> {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return;
  stopSpeaking();
  const myToken = queueToken;
  const chunks = splitForTts(clean);
  let useBrowser = false;
  let started = false;

  for (let i = 0; i < chunks.length; i++) {
    if (myToken !== queueToken) return;
    const chunk = chunks[i];
    const isLast = i === chunks.length - 1;
    const chunkOpts = {
      voiceId: opts?.voiceId,
      onStart: !started ? opts?.onStart : undefined,
      onEnd: isLast ? opts?.onEnd : undefined,
    };
    if (useBrowser) {
      await speakBrowser(chunk, chunkOpts);
      started = true;
      continue;
    }
    const mode = await speakChunk(chunk, chunkOpts);
    started = true;
    if (mode === "browser") useBrowser = true;
  }
}
