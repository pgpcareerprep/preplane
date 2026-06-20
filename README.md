# PrepLane

AI-powered career prep platform for placements, mentoring, and last-mile preparation (LMP).

## Stack

- **Frontend:** Vite, React, TypeScript, Tailwind, shadcn/ui — deployed on Cloudflare Pages
- **Backend:** Supabase (Postgres, Auth, Edge Functions, Realtime)
- **Integrations:** Google Sheets sync, Gemini AI, Firecrawl

## Development

```bash
npm install
npm run dev
```

## Quality checks

```bash
npm run verify   # lint + test + build + bundle check + audit
```

## Production

- App: https://preplane.pages.dev
- Supabase project secrets must include `GEMINI_API_KEY` for AI edge functions (copilot, JD parse, mentor enrich, etc.)
