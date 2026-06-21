import type { DiscoveredMentor, Platform, SearchHit } from "../types.ts";
import { cleanLinkedin, platformFromUrl } from "../mentorSanitize.ts";

type GroundingChunk = {
  web?: { uri?: string; title?: string };
  uri?: string;
  title?: string;
};

function mentorsFromGroundingChunks(
  chunks: GroundingChunk[],
  platforms: Platform[],
): DiscoveredMentor[] {
  const mentors: DiscoveredMentor[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const uri = chunk.web?.uri ?? chunk.uri ?? "";
    const title = chunk.web?.title ?? chunk.title ?? "";
    if (!uri || seen.has(uri)) continue;
    const platform = platformFromUrl(uri);
    if (!platform || !platforms.includes(platform)) continue;
    seen.add(uri);
    const hit: SearchHit = { url: uri, title, description: "" };
    const m = platform === "LinkedIn"
      ? buildLinkedInFromSnippet(hit)
      : buildPlatformFromSnippet(hit, platform);
    if (m) mentors.push(m);
  }
  return mentors;
}

function parseMentorsFromText(rawText: string, limit: number): DiscoveredMentor[] {
  const jsonMatch = rawText.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/) ??
    rawText.match(/(\[[\s\S]*\])/);
  if (!jsonMatch) return [];
  const jsonStr = jsonMatch[1] ?? jsonMatch[0];
  try {
    const parsed = JSON.parse(jsonStr) as DiscoveredMentor[];
    return Array.isArray(parsed) ? parsed.slice(0, limit) : [];
  } catch {
    return [];
  }
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
): Promise<DiscoveredMentor[]> {
  const skillList = skills.slice(0, 5).join(", ");
  const context = [
    role && `Role: ${role}`,
    company && `Target company background: ${company}`,
    industry && `Industry: ${industry}`,
    seniority && `Seniority: ${seniority}`,
    skillList && `Key skills: ${skillList}`,
    jdText && `JD excerpt: ${jdText.slice(0, 500)}`,
  ].filter(Boolean).join("\n");

  const platformList = platforms.join(", ");
  const prompt = `Find real ${role || "professional"} mentors for interview preparation.
${context}

Search the web for mentors on ${platformList} who match this role.
Return a JSON array (max ${limit} items) with real verified profiles only:
[{
  "name": "Full Name",
  "current_role": "Job Title",
  "company": "Company",
  "industry": "${industry || "Technology"}",
  "skills": ["skill1"],
  "seniority_level": "Senior",
  "years_experience": null,
  "email": null,
  "phone": null,
  "pricing": null,
  "platform": "LinkedIn|Topmate|ADPList|Superpeer",
  "linkedin": "https://linkedin.com/in/... or null",
  "booking_url": "profile URL or null",
  "source_url": "https://..."
}]
Return valid JSON array only. Every entry must have a real source_url on ${platformList}.`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      }),
    },
  );

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Gemini search API ${resp.status}: ${t.slice(0, 200)}`);
  }

  const data = await resp.json() as Record<string, unknown>;
  const candidate = (data?.candidates as Array<Record<string, unknown>>)?.[0];
  const parts: unknown[] = (candidate?.content as { parts?: unknown[] })?.parts ?? [];
  const rawText = parts
    .map((p) => (typeof (p as { text?: string }).text === "string" ? (p as { text: string }).text : ""))
    .join("\n");

  const groundingMeta = candidate?.groundingMetadata as {
    groundingChunks?: GroundingChunk[];
  } | undefined;
  const fromChunks = mentorsFromGroundingChunks(groundingMeta?.groundingChunks ?? [], platforms);
  const fromJson = parseMentorsFromText(rawText, limit);

  const merged: DiscoveredMentor[] = [];
  const seen = new Set<string>();
  for (const m of [...fromJson, ...fromChunks]) {
    const key = (m.source_url || m.linkedin || m.booking_url || `${m.name}|${m.company}`).toLowerCase();
    if (!m.name || seen.has(key)) continue;
    seen.add(key);
    if (!m.platform || !platforms.includes(m.platform as Platform)) {
      const url = m.source_url || m.booking_url || m.linkedin || "";
      const inferred = platformFromUrl(url);
      if (inferred) m.platform = inferred;
    }
    if (m.linkedin) m.linkedin = cleanLinkedin(m.linkedin);
    if (!m.source_url) m.source_url = m.booking_url || m.linkedin || undefined;
    merged.push(m);
    if (merged.length >= limit) break;
  }
  return merged;
}

export function buildLinkedInFromSnippet(hit: SearchHit): DiscoveredMentor | null {
  if (!/linkedin\.com\/in\//i.test(hit.url)) return null;
  const title = (hit.title || "").replace(/\s*[\|·]\s*LinkedIn.*$/i, "").trim();
  if (!title) return null;
  const parts = title.split(/\s+[-–—]\s+/);
  const name = (parts[0] || "").trim();
  if (!name || name.length < 2) return null;
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
  if (!title) return null;
  const parts = title.split(/\s+[-–—|·]\s+/);
  const name = (parts[0] || "").trim();
  if (!name || name.length < 2) return null;
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
