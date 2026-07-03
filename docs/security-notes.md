# PrepLane security notes

## Browser DevTools warnings during Google sign-in

The **"WARNING! … Self-XSS"** banner and the **"Blocked aria-hidden"** accessibility warning both originate from **accounts.google.com** (Google's own OAuth sign-in page). They appear for every user of every site that uses Google OAuth. They are not exploitable from PrepLane, not fixable in this codebase, and require no action.

## OAuth consent screen shows `*.supabase.co`

The Google OAuth consent screen may show the raw Supabase project domain instead of "PrepLane". This is a cosmetic trust issue:

- **App name / logo:** Google Cloud Console → APIs & Services → OAuth consent screen → set App name to "PrepLane" and upload a logo, then publish.
- **Custom domain on consent screen:** Requires a Supabase custom domain (paid add-on). Optional.

## Security headers (Cloudflare Pages)

See `public/_headers` for additive response headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`). Content-Security-Policy is intentionally omitted to avoid breaking the Vite SPA; microphone access is not restricted because Voice Copilot requires it.
