/**
 * Auto-detect domain from role title using keyword mapping.
 * Returns { domain, confidence } or null if no match.
 */

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  "Product Management": [
    "product", "pm", "product manager", "product management", "product intern",
    "product lead", "product owner", "product analyst", "apm", "associate product",
  ],
  "Consulting": [
    "consultant", "consulting", "strategy", "management consulting",
    "business analyst", "business analysis", "advisory", "associate consultant",
  ],
  "Finance": [
    "finance", "financial", "investment", "banking", "analyst", "equity",
    "credit", "treasury", "accounting", "audit", "risk", "valuation",
    "corporate finance", "ib", "investment banking",
  ],
  "Data": [
    "data", "data science", "data analyst", "data engineer", "analytics",
    "machine learning", "ml", "ai", "deep learning", "nlp", "bi analyst",
    "business intelligence",
  ],
  "Marketing": [
    "marketing", "growth", "brand", "digital marketing", "content",
    "social media", "seo", "performance marketing", "growth associate",
    "growth manager", "brand manager",
  ],
  "Sales": [
    "sales", "business development", "bd", "account executive",
    "account manager", "sales associate", "revenue", "bdr", "sdr",
  ],
  "FO/COS": [
    "founder", "chief of staff", "cos", "founder's office", "fo",
    "general management", "ceo office", "founders office",
  ],
  "Supply Chain": [
    "supply chain", "operations", "logistics", "procurement", "scm",
    "supply chain management", "warehouse", "inventory",
  ],
  "HR": [
    "hr", "human resources", "people", "talent", "people operations",
    "hrbp", "talent acquisition", "recruitment",
  ],
  "Engineering": [
    "engineer", "engineering", "software", "developer", "sde", "swe",
    "frontend", "backend", "fullstack", "devops", "qa", "testing",
  ],
  "Design": [
    "design", "designer", "ux", "ui", "product design", "graphic design",
    "visual design", "interaction design",
  ],
};

export type DomainDetectionResult = {
  domain: string;
  confidence: number;
};

export const KNOWN_DOMAINS = Object.keys(DOMAIN_KEYWORDS);

export function detectDomain(roleTitle: string): DomainDetectionResult | null {
  if (!roleTitle || roleTitle.trim().length < 2) return null;

  const lower = roleTitle.toLowerCase().trim();
  let bestDomain: string | null = null;
  let bestScore = 0;

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        // Longer keyword matches = higher confidence
        const score = kw.length;
        if (score > bestScore) {
          bestScore = score;
          bestDomain = domain;
        }
      }
    }
  }

  if (!bestDomain) return null;

  // Confidence based on match quality
  const confidence = bestScore >= 10 ? 95 : bestScore >= 6 ? 85 : 72;
  return { domain: bestDomain, confidence };
}
