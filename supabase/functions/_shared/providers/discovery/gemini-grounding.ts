import type { DiscoveredMentor, Platform, SearchHit } from "../types.ts";
import { cleanLinkedin } from "../mentorSanitize.ts";

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

  const platformHint = platforms.includes("LinkedIn") ? "LinkedIn profiles and " : "";
  const prompt = `You are a mentor discovery assistant. Find real ${role || "professional"} mentors for interview preparation.
${context}

Search for real people who:
1. Have ${role} experience${company ? ` at companies like ${company}` : ""}
2. Are available as mentors on ${platformHint}Topmate, ADPList, or similar platforms
3. Match skills: ${skillList || role}

Return a JSON array of up to ${limit} real mentors with this exact structure:
[{
  "name": "Full Name",
  "current_role": "Current Job Title",
  "company": "Current Company",
  "industry": "${industry || "Technology"}",
  "skills": ["skill1", "skill2"],
  "seniority_level": "Senior|Mid|Junior|Lead|Director|VP|C-Suite",
  "years_experience": null,
  "email": null,
  "phone": null,
  "pricing": null,
  "platform": "LinkedIn|Topmate|ADPList",
  "linkedin": null,
  "booking_url": null,
  "source_url": "https://..."
}]

IMPORTANT: Only include real people you can verify. Return valid JSON array only.`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          responseMimeType: "text/plain",
          temperature: 0.1,
          maxOutputTokens: 2048,
        },
      }),
    },
  );

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Gemini search API ${resp.status}: ${t.slice(0, 200)}`);
  }

  const data = await resp.json() as Record<string, unknown>;
  const parts: unknown[] = (data?.candidates as { content?: { parts?: unknown[] } })?.[0]?.content?.parts ?? [];
  const rawText = parts
    .map((p) => (typeof (p as { text?: string }).text === "string" ? (p as { text: string }).text : ""))
    .join("\n");

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
