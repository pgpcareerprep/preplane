import { supabase } from "@/integrations/supabase/client";

const SPEAK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-speak`;

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

export function stopSpeaking() {
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
    // Chrome has a known bug where onend never fires. Failsafe: resolve after
    // an estimated duration + 1 s so the mic always starts eventually.
    const estimatedMs = Math.max(3000, (text.length / 15) * 1000 + 1000);
    const fallbackTimer = window.setTimeout(finish, estimatedMs);
    u.onstart = () => opts?.onStart?.();
    u.onend = () => { window.clearTimeout(fallbackTimer); finish(); };
    u.onerror = () => { window.clearTimeout(fallbackTimer); finish(); };
    try { window.speechSynthesis.speak(u); } catch { window.clearTimeout(fallbackTimer); finish(); }
  });
}

/**
 * Speaks text using the voice-speak edge function (Groq PlayAI → Gemini TTS →
 * browser fallback). New calls cancel previous playback.
 */
export async function speak(
  text: string,
  opts?: { voiceId?: string; onStart?: () => void; onEnd?: () => void },
): Promise<void> {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return;
  stopSpeaking();

  let resp: Response;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    resp = await fetch(SPEAK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ text: clean, voiceId: opts?.voiceId }),
    });
  } catch {
    return speakBrowser(clean, opts);
  }
  if (!resp.ok) {
    try { await resp.text(); } catch { /* noop */ }
    return speakBrowser(clean, opts);
  }

  const contentType = resp.headers.get("Content-Type") || "";
  if (!contentType.includes("audio")) {
    // Server signalled fallback
    try { await resp.text(); } catch { /* noop */ }
    return speakBrowser(clean, opts);
  }

  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  currentUrl = url;

  return new Promise<void>((resolve) => {
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
      speakBrowser(clean, opts).then(resolve);
    };
    audio.play().catch(() => speakBrowser(clean, opts).then(resolve));
  });
}
