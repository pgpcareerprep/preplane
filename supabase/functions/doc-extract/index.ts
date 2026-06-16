// doc-extract: server-side document text extraction.
// Supports PDF (via Gemini multimodal), DOCX (ZIP+XML parse), TXT/CSV (UTF-8).
// Accepts base64-encoded file content, returns extracted plain text.
// The extracted text can then be passed to parse-jd or cv-analysis.

import { requireAuth } from "../_shared/requireAuth.ts";
import { buildCorsHeaders, pickAllowedOrigin } from "../_shared/cors.ts";
import { DEFAULT_APP_ORIGIN } from "../_shared/appConfig.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": DEFAULT_APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 10 MB max file
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

function jsonError(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Vault helper ─────────────────────────────────────────────────────────────
const _vault = new Map<string, string>();
let _vaultLoaded = false;
async function loadVault(): Promise<void> {
  if (_vaultLoaded) return;
  _vaultLoaded = true;
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.1");
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: "vault" }, auth: { persistSession: false } },
    );
    const { data } = await sb.from("decrypted_secrets").select("name,decrypted_secret");
    for (const row of (data ?? []) as any[]) {
      if (row.name && row.decrypted_secret) _vault.set(row.name, row.decrypted_secret.trim());
    }
  } catch { /* non-fatal */ }
}
function getEnv(n: string): string | undefined {
  return Deno.env.get(n)?.trim() || _vault.get(n) || undefined;
}

// ─── PDF extraction via Gemini multimodal ─────────────────────────────────────
async function extractPdf(base64Data: string): Promise<string> {
  const key = getEnv("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY not configured");

  const resp = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: base64Data,
            },
          },
          {
            text: "Extract ALL text from this document exactly as it appears. Preserve section structure, headings, and bullet points. Do not summarize. Output plain text only — no markdown formatting, no commentary.",
          },
        ],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 8192 },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Gemini PDF extraction failed (${resp.status}): ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("Gemini returned empty text for PDF");
  return text;
}

// ─── DOCX extraction via ZIP+XML parse ───────────────────────────────────────
// DOCX is a ZIP containing word/document.xml. We extract and strip the XML.
async function extractDocx(base64Data: string): Promise<string> {
  // Decode base64 to Uint8Array
  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  // Use DecompressionStream to unzip (Deno supports Web Streams API)
  // We need to find and extract word/document.xml from the ZIP.
  // ZIP local file headers: signature 0x04034b50, filename follows.
  const docXml = findDocxContent(bytes);
  if (!docXml) throw new Error("Could not parse DOCX: word/document.xml not found in ZIP");

  // Strip XML tags and decode common XML entities
  const text = docXml
    .replace(/<w:br[^/]*/g, "\n")           // line breaks
    .replace(/<w:p[ >][^>]*>/g, "\n")        // paragraphs
    .replace(/<[^>]+>/g, " ")               // all other tags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x[0-9A-Fa-f]+;/g, " ")
    .replace(/\s{3,}/g, "\n\n")
    .trim();

  return text;
}

function findDocxContent(zipBytes: Uint8Array): string | null {
  const decoder = new TextDecoder("utf-8");
  const sig = [0x50, 0x4B, 0x03, 0x04]; // local file header signature
  let pos = 0;

  while (pos < zipBytes.length - 30) {
    // Find next local file header
    if (
      zipBytes[pos] === sig[0] && zipBytes[pos + 1] === sig[1] &&
      zipBytes[pos + 2] === sig[2] && zipBytes[pos + 3] === sig[3]
    ) {
      const compression   = (zipBytes[pos + 8] | (zipBytes[pos + 9] << 8));
      const compressedSz  = (zipBytes[pos + 18] | (zipBytes[pos + 19] << 8) | (zipBytes[pos + 20] << 16) | (zipBytes[pos + 21] << 24));
      const fileNameLen   = (zipBytes[pos + 26] | (zipBytes[pos + 27] << 8));
      const extraLen      = (zipBytes[pos + 28] | (zipBytes[pos + 29] << 8));
      const fileNameBytes = zipBytes.slice(pos + 30, pos + 30 + fileNameLen);
      const fileName      = decoder.decode(fileNameBytes);

      const dataStart = pos + 30 + fileNameLen + extraLen;
      const dataEnd   = dataStart + compressedSz;

      if (fileName === "word/document.xml" || fileName === "word/document2.xml") {
        const fileData = zipBytes.slice(dataStart, dataEnd);

        if (compression === 0) {
          // Stored (no compression)
          return decoder.decode(fileData);
        } else if (compression === 8) {
          // DEFLATE — use DecompressionStream
          try {
            const ds = new DecompressionStream("deflate-raw");
            const writer = ds.writable.getWriter();
            const reader = ds.readable.getReader();
            writer.write(fileData);
            writer.close();

            const chunks: Uint8Array[] = [];
            let done = false;
            // Synchronous-style drain is not possible in Deno; use a promise
            // We'll fall back to calling Gemini multimodal if this fails
            void (async () => {
              while (!done) {
                const { value, done: d } = await reader.read();
                if (d) { done = true; break; }
                if (value) chunks.push(value);
              }
            })();

            // For now, return null and let the caller fall back to Gemini
            return null;
          } catch {
            return null;
          }
        }
      }
      pos = dataEnd;
    } else {
      pos++;
    }
  }
  return null;
}

// Async DOCX extraction using DecompressionStream properly
async function extractDocxAsync(base64Data: string): Promise<string> {
  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const decoder = new TextDecoder("utf-8");
  const sig = [0x50, 0x4B, 0x03, 0x04];
  let pos = 0;

  while (pos < bytes.length - 30) {
    if (
      bytes[pos] === sig[0] && bytes[pos + 1] === sig[1] &&
      bytes[pos + 2] === sig[2] && bytes[pos + 3] === sig[3]
    ) {
      const compression  = (bytes[pos + 8] | (bytes[pos + 9] << 8));
      const compressedSz = (bytes[pos + 18] | (bytes[pos + 19] << 8) | (bytes[pos + 20] << 16) | (bytes[pos + 21] << 24));
      const fileNameLen  = (bytes[pos + 26] | (bytes[pos + 27] << 8));
      const extraLen     = (bytes[pos + 28] | (bytes[pos + 29] << 8));
      const fileName     = decoder.decode(bytes.slice(pos + 30, pos + 30 + fileNameLen));

      const dataStart = pos + 30 + fileNameLen + extraLen;
      const dataEnd   = dataStart + compressedSz;

      if (fileName === "word/document.xml") {
        const fileData = bytes.slice(dataStart, dataEnd);
        let xmlStr: string;

        if (compression === 0) {
          xmlStr = decoder.decode(fileData);
        } else if (compression === 8) {
          // DEFLATE decompression via DecompressionStream
          const ds = new DecompressionStream("deflate-raw");
          const writer = ds.writable.getWriter();
          const reader = ds.readable.getReader();
          writer.write(fileData);
          writer.close();

          const chunks: Uint8Array[] = [];
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) chunks.push(value);
          }
          const total = chunks.reduce((a, c) => a + c.length, 0);
          const merged = new Uint8Array(total);
          let off = 0;
          for (const c of chunks) { merged.set(c, off); off += c.length; }
          xmlStr = decoder.decode(merged);
        } else {
          throw new Error(`Unsupported DOCX compression method: ${compression}`);
        }

        return xmlStr
          .replace(/<w:br[^/]*/g, "\n")
          .replace(/<w:p[ >][^>]*>/g, "\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
          .replace(/\s{3,}/g, "\n\n").trim();
      }

      pos = dataEnd;
    } else {
      pos++;
    }
  }
  throw new Error("word/document.xml not found in DOCX archive");
}

// ─── Plain text (TXT, CSV, etc.) ──────────────────────────────────────────────
function extractText(base64Data: string): string {
  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

// ─── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  corsHeaders["Access-Control-Allow-Origin"] = pickAllowedOrigin(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonError("POST only", 405);

  await loadVault();

  const auth = await requireAuth(req, corsHeaders);
  if ("error" in auth) return auth.error;

  const ctype = (req.headers.get("content-type") || "").toLowerCase();
  if (!ctype.includes("application/json")) return jsonError("Content-Type must be application/json", 415);

  let body: any;
  try { body = await req.json(); } catch { return jsonError("Invalid JSON body"); }

  const fileBase64: string = (body.fileBase64 || "").trim();
  const mimeType: string   = (body.mimeType  || "").trim().toLowerCase();
  const fileName: string   = (body.fileName  || "file").trim();

  if (!fileBase64) return jsonError("fileBase64 is required");
  if (!mimeType)   return jsonError("mimeType is required");

  // Estimate byte size from base64 length
  const approxBytes = Math.ceil(fileBase64.length * 0.75);
  if (approxBytes > MAX_FILE_BYTES) return jsonError(`File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`, 413);

  try {
    let extractedText = "";

    if (mimeType === "application/pdf") {
      extractedText = await extractPdf(fileBase64);

    } else if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType === "application/msword" ||
      fileName.toLowerCase().endsWith(".docx")
    ) {
      extractedText = await extractDocxAsync(fileBase64);

    } else if (
      mimeType.startsWith("text/") ||
      mimeType === "application/json" ||
      mimeType === "text/csv" ||
      fileName.toLowerCase().endsWith(".txt") ||
      fileName.toLowerCase().endsWith(".csv")
    ) {
      extractedText = extractText(fileBase64);

    } else if (mimeType.includes("image/")) {
      // Use Gemini multimodal for images (useful for scanned documents)
      const key = getEnv("GEMINI_API_KEY");
      if (!key) return jsonError("GEMINI_API_KEY not configured for image extraction", 500);
      const imgMime = mimeType.startsWith("image/") ? mimeType : "image/jpeg";
      const resp = await fetch(`${GEMINI_URL}?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType: imgMime, data: fileBase64 } },
            { text: "Extract ALL text visible in this image exactly as it appears. Output plain text only." },
          ]}],
          generationConfig: { temperature: 0, maxOutputTokens: 4096 },
        }),
      });
      if (!resp.ok) return jsonError(`Image OCR failed (${resp.status})`, 502);
      const data = await resp.json();
      extractedText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    } else {
      return jsonError(`Unsupported file type: ${mimeType}. Supported: PDF, DOCX, TXT, CSV, images.`, 415);
    }

    if (!extractedText || extractedText.trim().length < 20) {
      return jsonError("Extracted text is too short — the document may be empty or unreadable");
    }

    return new Response(JSON.stringify({
      ok: true,
      fileName,
      mimeType,
      charCount: extractedText.length,
      wordCount: extractedText.split(/\s+/).filter(Boolean).length,
      text: extractedText,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("[doc-extract] error:", (e as Error).message);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
