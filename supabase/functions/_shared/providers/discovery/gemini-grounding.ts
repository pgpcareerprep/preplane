import type { DiscoveredMentor, Platform, SearchHit } from "../types.ts";
import { GEMINI_FREE_MODEL } from "../config.ts";
import { callGeminiJson } from "../extract/gemini.ts";
import { cleanLinkedin, platformFromUrl } from "../mentorSanitize.ts";

type GroundingChunk = {
  web?: { uri?: string; title?: string };
  uri?: string;
  title?: string;
};

export type GeminiDiscoveryResult = {
  mentors: DiscoveredMentor[];
  webSearchQueries: string[];
  error?: string;
};

const PROFILE_URL_RES: { platform: Platform; re: RegExp }[] = [
  { platform: "LinkedIn", re: /https?:\/\/(?:[\w-]+\.)?linkedin\.com\/in\/[\w%-]+/gi },
  { platform: "Topmate", re: /https?:\/\/(?:[\w-]+\.)?topmate\.io\/[\w%-]+/gi },
  { platform: "ADPList", re: /https?:\/\/(?:[\w-]+\.)?adplist\.org\/[\w%-]+/gi },
  { platform: "Superpeer", re: /https?:\/\/(?:[\w-]+\.)?superpeer\.com\/[\w%-]+/gi },
];

function extractProfileUrls(text: string, platforms: Platform[]): Array<{ url: string; platform: Platform }> {
  const found: Array<{ url: string; platform: Platform }> = [];
  const seen = new Set<string>();
  for (const { platform, re } of PROFILE_URL_RES) {
    if (!platforms.includes(platform)) continue;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const url = m[0].replace(/[)\]"'`,.;]+$/, "");
      const key = url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ url, platform });
    }
  }
  return found;
}

function slugToName(slug: string): string {
  return slug
    .replace(/[?#].*$/, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function mentorFromProfileUrl(url: string, platform: Platform, titleHint = ""): DiscoveredMentor | null {
  const slug = url.split("/").filter(Boolean).pop() ?? "";
  const nameFromTitle = titleHint.split(/\s*[|\-–—·]\s*/)[0]?.trim() ?? "";
  const name = (nameFromTitle.length >= 2 && !/^https?:/i.test(nameFromTitle))
    ? nameFromTitle
    : slugToName(decodeURIComponent(slug));
  if (!name || name.length < 2) return null;
  return {
    name,
    current_role: "",
    company: "",
    industry: "",
    skills: [],
    seniority_level: "Mid",
    years_experience: null,
    email: null,
    phone: null,
    pricing: null,
    platform,
    linkedin: platform === "LinkedIn" ? cleanLinkedin(url) : null,
    booking_url: platform !== "LinkedIn" ? url : null,
    source_url: url,
  };
}

function mentorsFromGroundingChunks(
  chunks: GroundingChunk[],
  platforms: Platform[],
): DiscoveredMentor[] {
  const corpus = chunks.map((c) => `${c.web?.title ?? c.title ?? ""} ${c.web?.uri ?? c.uri ?? ""}`).join("\n");
  const fromUrls = extractProfileUrls(corpus, platforms);
  const mentors: DiscoveredMentor[] = [];
  const seen = new Set<string>();
  for (const { url, platform } of fromUrls) {
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const chunk = chunks.find((c) => `${c.web?.title ?? c.title ?? ""} ${c.web?.uri ?? c.uri ?? ""}`.includes(url));
    const title = chunk?.web?.title ?? chunk?.title ?? "";
    const m = mentorFromProfileUrl(url, platform, title);
    if (m) mentors.push(m);
  }
  return mentors;
}

function parseMentorsFromText(rawText: string, limit: number, platforms: Platform[]): DiscoveredMentor[] {
  const jsonMatch = rawText.match(/```(?:json)?\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```/) ??
    rawText.match(/(\{[\s\S]*"mentors"[\s\S]*\})/) ??
    rawText.match(/(\[[\s\S]*\])/);
  if (!jsonMatch) return [];
  const jsonStr = jsonMatch[1] ?? jsonMatch[0];
  try {
    const parsed = JSON.parse(jsonStr) as DiscoveredMentor[] | { mentors?: DiscoveredMentor[] };
    const list = Array.isArray(parsed) ? parsed : (parsed.mentors ?? []);
    return list
      .filter((m) => m?.name && platforms.includes(m.platform as Platform))
      .slice(0, limit);
  } catch {
    return [];
  }
}

async function extractMentorsStructured(
  apiKey: string,
  corpus: string,
  role: string,
  platforms: Platform[],
  limit: number,
  userId?: string | null,
): Promise<DiscoveredMentor[]> {
  if (!corpus.trim()) return [];
  const sys =
    "Extract real mentor profiles from web search results. Return ONLY JSON: " +
    `{"mentors":[{"name":"","current_role":"","company":"","industry":"","skills":[],"seniority_level":"Mid",` +
    `"platform":"LinkedIn|Topmate|ADPList|Superpeer","linkedin":null,"booking_url":null,"source_url":""}]}. ` +
    "Include ONLY people explicitly mentioned with a profile URL on Topmate, ADPList, LinkedIn, or Superpeer. " +
    "Every mentor MUST have a real source_url. Do not invent names.";
  const user = JSON.stringify({
    role,
    platforms,
    limit,
    searchResults: corpus.slice(0, 14000),
  });
  const raw = await callGeminiJson(apiKey, sys, user, AbortSignal.timeout(35000), userId);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { mentors?: DiscoveredMentor[] };
    return (parsed.mentors ?? []).slice(0, limit);
  } catch {
    return [];
  }
}

function mergeDiscovered(
  lists: DiscoveredMentor[][],
  platforms: Platform[],
  limit: number,
): DiscoveredMentor[] {
  const merged: DiscoveredMentor[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const m of list) {
      const url = m.source_url || m.booking_url || m.linkedin || "";
      const key = (url || `${m.name}|${m.company}`).toLowerCase();
      if (!m.name || seen.has(key)) continue;
      if (!m.platform || !platforms.includes(m.platform as Platform)) {
        const inferred = platformFromUrl(url);
        if (inferred) m.platform = inferred;
        else continue;
      }
      if (m.linkedin) m.linkedin = cleanLinkedin(m.linkedin);
      if (!m.source_url) m.source_url = m.booking_url || m.linkedin || undefined;
      seen.add(key);
      merged.push(m);
      if (merged.length >= limit) return merged;
    }
  }
  return merged;
}

export async function discoverViaGeminiSearch(
  apiKey: string,
  role: string,
  company: string,
  industry: string,
  skills: string[],
  seniority: string,
  jdText: string,
  limit: number,
  platforms: Platform[],
  userId?: string | null,
): Promise<GeminiDiscoveryResult> {
  const skillList = skills.slice(0, 5).join(", ");
  const context = [
    role && `Role: ${role}`,
    company && `Company: ${company}`,
    industry && `Industry: ${industry}`,
    seniority && `Seniority: ${seniority}`,
    skillList && `Skills: ${skillList}`,
    jdText && `JD: ${jdText.slice(0, 400)}`,
  ].filter(Boolean).join("\n");

  const platformList = platforms.join(", ");
  const prompt = `Search the web and list real ${role || "professional"} mentors/coaches for interview prep.
${context}

Find profiles on ${platformList}. Prefer Topmate and ADPList booking pages and LinkedIn /in/ profiles.
Return up to ${limit} mentors as a JSON array with name, current_role, company, platform, source_url, linkedin, booking_url.`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FREE_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      }),
    },
  );

  if (!resp.ok) {
    const t = await resp.text();
    const errMsg = `Gemini search API ${resp.status}: ${t.slice(0, 300)}`;
    console.warn("[discoverViaGeminiSearch]", errMsg);
    throw new Error(errMsg);
  }

  const data = await resp.json() as Record<string, unknown>;
  const candidate = (data?.candidates as Array<Record<string, unknown>>)?.[0];
  const parts: unknown[] = (candidate?.content as { parts?: unknown[] })?.parts ?? [];
  const rawText = parts
    .map((p) => (typeof (p as { text?: string }).text === "string" ? (p as { text: string }).text : ""))
    .join("\n");

  const groundingMeta = candidate?.groundingMetadata as {
    groundingChunks?: GroundingChunk[];
    webSearchQueries?: string[];
  } | undefined;

  const webSearchQueries = Array.isArray(groundingMeta?.webSearchQueries)
    ? groundingMeta.webSearchQueries.filter((q): q is string => typeof q === "string")
    : [];

  const corpus = [
    rawText,
    ...(groundingMeta?.groundingChunks ?? []).map((c) =>
      `${c.web?.title ?? c.title ?? ""}\n${c.web?.uri ?? c.uri ?? ""}`,
    ),
  ].join("\n\n");

  const fromUrls = extractProfileUrls(corpus, platforms).map(({ url, platform }) => {
    const m = mentorFromProfileUrl(url, platform);
    return m;
  }).filter((m): m is DiscoveredMentor => !!m);

  const fromChunks = mentorsFromGroundingChunks(groundingMeta?.groundingChunks ?? [], platforms);
  const fromJson = parseMentorsFromText(rawText, limit, platforms);
  const fromStructured = await extractMentorsStructured(apiKey, corpus, role, platforms, limit, userId);

  const mentors = mergeDiscovered([fromStructured, fromJson, fromUrls, fromChunks], platforms, limit);
  return { mentors, webSearchQueries };
}

export function buildLinkedInFromSnippet(hit: SearchHit): DiscoveredMentor | null {
  if (!/linkedin\.com\/in\//i.test(hit.url)) return null;
  const title = (hit.title || "").replace(/\s*[\|·]\s*LinkedIn.*$/i, "").trim();
  if (!title) return mentorFromProfileUrl(hit.url, "LinkedIn");
  const parts = title.split(/\s+[-–—]\s+/);
  const name = (parts[0] || "").trim();
  if (!name || name.length < 2) return mentorFromProfileUrl(hit.url, "LinkedIn");
  let role = "";
  let company = "";
  if (parts.length >= 2) {
    const rest = parts.slice(1).join(" - ");
    const m = rest.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
    if (m) {
      role = m[1].trim();
      company = m[2].trim();
    } else if (parts.length >= 3) {
      role = parts[1].trim();
      company = parts.slice(2).join(" - ").trim();
    } else {
      role = rest.trim();
    }
  }
  if (!company && hit.description) {
    const m = hit.description.match(/\b(?:at|@)\s+([A-Z][A-Za-z0-9&.,'\- ]{1,60})/);
    if (m) company = m[1].trim().replace(/[.,;:]+$/, "");
  }
  return {
    name,
    current_role: role,
    company,
    industry: "",
    skills: [],
    seniority_level: "Mid",
    years_experience: null,
    email: null,
    phone: null,
    pricing: null,
    platform: "LinkedIn",
    linkedin: cleanLinkedin(hit.url),
    booking_url: null,
    source_url: hit.url,
  };
}

export function buildPlatformFromSnippet(hit: SearchHit, platform: Platform): DiscoveredMentor | null {
  const title = (hit.title || "")
    .replace(/\s*[\|·]\s*(Topmate|ADPList|Superpeer).*$/i, "")
    .trim();
  if (!title) return mentorFromProfileUrl(hit.url, platform);
  const parts = title.split(/\s+[-–—|·]\s+/);
  const name = (parts[0] || "").trim();
  if (!name || name.length < 2) return mentorFromProfileUrl(hit.url, platform);
  let role = "";
  let company = "";
  if (parts.length >= 2) {
    const rest = parts.slice(1).join(" - ");
    const m = rest.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
    if (m) { role = m[1].trim(); company = m[2].trim(); }
    else { role = rest.trim(); }
  }
  if (!company && hit.description) {
    const m = hit.description.match(/\b(?:at|@)\s+([A-Z][A-Za-z0-9&.,'\- ]{1,60})/);
    if (m) company = m[1].trim().replace(/[.,;:]+$/, "");
  }
  return {
    name,
    current_role: role,
    company,
    industry: "",
    skills: [],
    seniority_level: "Mid",
    years_experience: null,
    email: null,
    phone: null,
    pricing: null,
    platform,
    linkedin: null,
    booking_url: hit.url,
    source_url: hit.url,
  };
}

/** Search results as markdown corpus (for mentor-profile-enrich). */
export function searchHitsToCorpus(hits: SearchHit[]): string {
  return hits
    .slice(0, 6)
    .map((h) => `### ${h.title}\n${h.url}\n${h.description}`)
    .join("\n\n")
    .slice(0, 8000);
}
