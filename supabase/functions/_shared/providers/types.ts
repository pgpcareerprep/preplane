export type SearchHit = { url: string; title: string; description: string };

export interface SearchProvider {
  name: string;
  free: boolean;
  search(q: string, limit: number, signal?: AbortSignal): Promise<SearchHit[]>;
}

export interface ScrapeResult {
  markdown: string;
  json: Record<string, unknown> | null;
}

export interface ScrapeProvider {
  name: string;
  free: boolean;
  scrape(url: string, signal?: AbortSignal): Promise<ScrapeResult | null>;
}

export type Platform = "Topmate" | "ADPList" | "LinkedIn" | "Superpeer";

export type Pricing = { amount: number; currency: string; unit: string } | null;

export type DiscoveredMentor = {
  name: string;
  current_role: string;
  company: string;
  industry: string;
  skills: string[];
  seniority_level: string;
  years_experience: number | null;
  email: string | null;
  phone: string | null;
  pricing: Pricing;
  platform: Platform;
  linkedin: string | null;
  booking_url: string | null;
  source_url: string;
  topmate_url?: string | null;
  adplist_url?: string | null;
  location?: string | null;
  country?: string | null;
  region_verified?: boolean;
  region_evidence?: string | null;
  snippet_verified?: boolean;
  confidence?: number;
  matched_fields?: string[];
  evidence?: string;
};
