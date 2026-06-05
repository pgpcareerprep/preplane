/**
 * Normalize any LinkedIn value (full URL, handle, or messy combo) into a clean profile URL.
 * Handles cases like:
 *   "prakash-sarangi-54738951"
 *   "https://www.linkedin.com/in/prakash-sarangi-54738951"
 *   "linkedin.com/in/prakash-sarangi-54738951?utm_source=..."
 *   "https://linkedin.com/in/https://www.linkedin.com/in/prakash-sarangi-54738951" (double-prefixed)
 */
export function linkedinHref(value?: string | null): string {
  if (!value) return "#";
  let v = String(value).trim();
  if (!v) return "#";

  // Strip any/all leading occurrences of linkedin URL prefixes (handles double-prefix bug)
  // Repeat until no more leading prefixes are found.
  const prefixRe = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub|profile\/view\?id=)\/?/i;
  while (prefixRe.test(v)) {
    v = v.replace(prefixRe, "");
  }
  // Also strip leftover protocol if any
  v = v.replace(/^https?:\/\//i, "");

  // Drop query/hash and trailing slashes
  v = v.split("?")[0].split("#")[0].replace(/\/+$/g, "").replace(/^\/+/g, "");

  if (!v) return "#";

  return `https://www.linkedin.com/in/${v}`;
}
