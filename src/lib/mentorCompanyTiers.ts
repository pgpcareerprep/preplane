import { supabase } from "@/integrations/supabase/client";

export type MentorCompanyTiers = {
  tier1: string[];
  tier2: string[];
  startup_markers: string[];
};

export const DEFAULT_MENTOR_COMPANY_TIERS: MentorCompanyTiers = {
  tier1: [
    "google", "alphabet", "apple", "meta", "facebook", "amazon", "microsoft",
    "netflix", "openai", "nvidia", "tesla", "mckinsey", "bcg", "boston consulting",
    "bain", "goldman", "goldman sachs", "morgan stanley", "jpmorgan", "jp morgan",
    "deloitte consulting", "blackrock",
  ],
  tier2: [
    "swiggy", "zomato", "flipkart", "razorpay", "paytm", "uber", "lyft", "stripe",
    "atlassian", "adobe", "salesforce", "oracle", "ibm", "linkedin", "snowflake",
    "airbnb", "spotify", "shopify", "twilio", "datadog", "vercel", "cloudflare",
    "intel", "qualcomm", "samsung", "tcs", "infosys", "wipro", "accenture",
    "cred", "phonepe", "ola", "zerodha", "myntra", "dream11", "byju", "unacademy",
    "freshworks", "zoho", "postman",
  ],
  startup_markers: ["labs", "ai", "tech", "studio", "ventures"],
};

let current = DEFAULT_MENTOR_COMPANY_TIERS;

export function getMentorCompanyTiers(): MentorCompanyTiers {
  return current;
}

export async function fetchMentorCompanyTiers(): Promise<MentorCompanyTiers> {
  const { data, error } = await supabase.from("system_settings").select("value").eq("key", "mentor_company_tiers").maybeSingle();
  if (error) throw error;
  const value = (data?.value ?? {}) as Partial<MentorCompanyTiers>;
  current = {
    tier1: value.tier1?.length ? value.tier1 : DEFAULT_MENTOR_COMPANY_TIERS.tier1,
    tier2: value.tier2?.length ? value.tier2 : DEFAULT_MENTOR_COMPANY_TIERS.tier2,
    startup_markers: value.startup_markers?.length ? value.startup_markers : DEFAULT_MENTOR_COMPANY_TIERS.startup_markers,
  };
  return current;
}
