-- Versioned operational settings. Browser localStorage is reserved for UI
-- preferences; matching/discovery behavior is authoritative in Postgres.

INSERT INTO public.system_settings(key, value, updated_by)
VALUES
  (
    'external_discovery_config',
    '{"topmate":true,"adplist":true,"linkedin":false,"superpeer":false,"region":"global","ttl":{"topmate":6,"adplist":6,"linkedin":24}}',
    'audit-remediation'
  ),
  (
    'mentor_company_tiers',
    '{"tier1":["google","alphabet","apple","meta","facebook","amazon","microsoft","netflix","openai","nvidia","tesla","mckinsey","bcg","boston consulting","bain","goldman","goldman sachs","morgan stanley","jpmorgan","jp morgan","deloitte consulting","blackrock"],"tier2":["swiggy","zomato","flipkart","razorpay","paytm","uber","lyft","stripe","atlassian","adobe","salesforce","oracle","ibm","linkedin","snowflake","airbnb","spotify","shopify","twilio","datadog","vercel","cloudflare","intel","qualcomm","samsung","tcs","infosys","wipro","accenture","cred","phonepe","ola","zerodha","myntra","dream11","byju","unacademy","freshworks","zoho","postman"],"startup_markers":["labs","ai","tech","studio","ventures"]}',
    'audit-remediation'
  )
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();
