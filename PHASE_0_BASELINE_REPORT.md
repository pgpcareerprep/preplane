# PrepLane Phase 0 Baseline Safety Report

Date: 2026-06-10  
Repository: `/Users/viditvishal/preplane`  
Branch: `main`  
Commit: `1fdaa91` (`Refine Copilot UI and agent responses`)

## Safety Status

No application code, production data, database schema, environment variables, Supabase secrets, or Google Sheet data were changed during Phase 0.

The requested starting workspace, `/Users/viditvishal/Downloads/Backup of LMP Magic (sheet)`, is not a Git/application repository. It has no `.git`, `package.json`, `src`, or `supabase` directory. The baseline was therefore performed against the active PrepLane repository at `/Users/viditvishal/preplane`.

Existing untracked files were preserved:

- `.claude/`
- `END_TO_END_AUDIT_REPORT.md`

## Architecture Inventory

| Area | Baseline |
|---|---|
| Frontend | React 18, TypeScript, Vite, React Router, TanStack Query, Tailwind/shadcn |
| Frontend source | 407 files under `src` |
| Backend | Supabase Postgres, RLS, triggers, RPCs, Edge Functions |
| Supabase source | 227 files under `supabase` |
| Edge Functions | 20 product functions plus `_shared` helpers |
| Authentication | Supabase implicit auth flow; session persisted in browser localStorage |
| Deployment assumptions | Cloudflare Pages frontend and linked Supabase project |
| External integrations | Google Sheets, Gmail, AI providers/OpenRouter/Gemini, external mentor discovery |

## Routing and Access Baseline

- `AuthGate` protects application routes and preserves the requested redirect.
- `RouteRoleGate` uses the authenticated real role.
- Process creation is route-gated to admin and allocator.
- Import history, student detail, user management, and knowledge base are admin-gated.
- Data Sources and the parent Settings route allow admin, allocator, and POC.
- Many screens and action buttons use `viewAsRole` instead of the authenticated role.
- Copilot explicitly attempts to make view-as read-only, but there is no universal mutation-boundary guard for all UI workflows.

Primary files:

- `src/App.tsx`
- `src/components/auth/AuthGate.tsx`
- `src/lib/rolesContext.tsx`
- `src/lib/permissions.ts`
- `src/lib/hooks/usePermissions.ts`

## Supabase and RLS Baseline

- The browser client uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Service-role access is limited to Edge Functions and database-trigger/internal paths.
- The migration history contains many incremental and overlapping policy/sync changes.
- Local and linked migration versions are aligned through `20260609213000`.
- `supabase db lint --linked` completed successfully with **no schema errors found**.
- Edge Function config explicitly disables gateway JWT verification only for `parse-jd` and `external-mentor-search`; both currently perform application-level authentication.

Phase 1 must still verify authorization behavior for every privileged function because schema lint does not test Edge Function authorization or business-level RLS expectations.

## LMP Creation Baseline

Current flow:

1. `CreateLmpPage` collects company, role, domain, JD, and confirmed POC selection.
2. `createLmpProcess` resolves POC display names and domain ID.
3. It inserts into `lmp_processes`.
4. Database triggers populate related POC links.
5. A background call mirrors the created LMP to Google Sheets.

Known baseline issue:

- `CreateLmpPage` passes `createdBy: role`.
- The value `"admin"` or `"allocator"` can then be stored in `allocator` and `jd_uploaded_by`.

Primary files:

- `src/pages/CreateLmpPage.tsx`
- `src/lib/createLmpProcess.ts`

## Sheet Sync Baseline

The database is intended to be canonical, while Sheets remains an operational mirror. Current implementation has several active or partially active paths:

- Process creation directly invokes `sheets-lmp` in the background.
- Database triggers enqueue `sheet_write_queue` rows.
- Triggers may also invoke `sheets-lmp` through `pg_net`.
- `sheets-retry-sweeper` drains queued writes.
- `sync-ingest`, `sheets-pull-comments`, and frontend sheet hooks provide additional sync/read behavior.

Safety-positive behavior:

- `sheet_write_queue` exists as a durable retry mechanism.
- Several sync paths refuse ambiguous company/role writes.

Baseline risk:

- Multiple paths and historical migrations make it unclear which path is authoritative for each operation.
- Frontend and Edge Function field maps implement different Sheet-to-DB translation rules.
- Creation comments describe immediate/awaited sync, while implementation uses a background call.

Primary files:

- `src/lib/sheets/*`
- `src/lib/createLmpProcess.ts`
- `supabase/functions/sheets-lmp/index.ts`
- `supabase/functions/sheets-retry-sweeper/index.ts`
- `supabase/functions/sync-ingest/index.ts`

## POC Allocation Baseline

Current allocation includes:

- Domain matching
- Load thresholds
- Fairness and underutilization scoring
- JD skill scoring
- Historical company/role matching
- Support POC suggestions

Known baseline inconsistencies:

- Documentation describes cross-domain fallback, while the pool can throw `NO_DOMAIN_POCS`.
- Allocation Path C remains in types/docs/scoring but `detectPath()` cannot select it.
- Existing company/role assignment can bypass current load thresholds.
- Historical fuzzy name matching accepts any shared name token.
- Domain alias resolution uses mutable module-level state.

Primary file:

- `src/lib/pocAllocation.ts`

## Mentor and Session Baseline

- A shared `resolveMentorDbId` service exists.
- `MentorsTab` routes several flows through it, but also contains additional direct mentor/session persistence logic.
- Matching/scoring includes hardcoded company-tier lists.
- Session creation and mentor assignment are coupled to a large UI component.

Primary files:

- `src/lib/mentorResolver.ts`
- `src/lib/mentorPipeline.ts`
- `src/lib/mentorMatchRunner.ts`
- `src/components/lmp/detail/MentorsTab.tsx`

## Copilot and Voice Copilot Baseline

- Both functions authenticate requests using `requireAuth`.
- Both use service-role clients for data/tool execution.
- Both support view-as context and attempt to block writes while impersonating.

Critical baseline issue:

- `copilot-ai` stores request cache, role, user ID, POC ID, plan, and view-as state in module-level mutable variables.
- `voice-copilot` stores user ID and view-as state in module-level mutable variables.
- Concurrent requests can therefore overwrite another request's state inside a reused Edge Function isolate.

Primary files:

- `supabase/functions/copilot-ai/index.ts`
- `supabase/functions/voice-copilot/index.ts`
- `supabase/functions/_shared/requireAuth.ts`
- `supabase/functions/_shared/rbac.ts`

## Privileged Edge Function Authorization Baseline

Shared `requireAuth` supports role checks, but no shared `requireInternalSecret` helper currently exists.

Functions requiring Phase 1 hardening:

- `progress-reminder-cron`
- `send-progress-confirmation-email`
- `sheets-backfill-lmp-id`
- `sheets-retry-sweeper`
- `send-test-reminder-email`

Current concerns:

- Several functions create service-role clients without an internal/admin check.
- `sheets-backfill-lmp-id` documents “admin only” but does not enforce it internally.
- `send-test-reminder-email` authenticates but permits an arbitrary recipient.

## Verification Results

### Tests

Command: `npm test`

- Result: passed
- Test files: 12 passed
- Tests: 86 passed
- Duration: 2.53 seconds

Coverage gaps include allocation, mentor/session lifecycle, permission matrices, view-as mutation safety, Edge Function authorization, Copilot concurrency, RLS integration, and authenticated browser workflows.

### Production Build

Command: `npm run build`

- Result: passed
- Modules transformed: 4,219
- Build duration: 11.91 seconds

Warnings:

- Browser compatibility data is stale.
- Ambiguous Tailwind easing class.
- `src/index.css` has an `@import` after other statements.
- Bluebird contains `eval`.
- Large chunks include the main bundle, Add Candidates, LMP Guide, XLSX, Copilot, and LMP Detail.

### Lint

Command: `npm run lint`

- Result: completed with zero errors
- Warnings: 626
- Dominant warning: explicit `any`
- Additional warning: missing React hook dependency in `src/lib/rolesContext.tsx`

### Dependency Audit

Command: `npm audit --json`

- Total vulnerabilities: 17
- Critical: 1
- High: 9
- Moderate: 7

Notable direct or high-impact packages:

- `vitest`: critical, fix available
- `react-router-dom`: high, fix available
- `xlsx`: high, no npm audit fix available
- `vite`, `postcss`, Rollup, lodash, minimatch, glob, flatted, YAML, AJV

### Database Verification

Commands:

- `supabase migration list --linked`
- `supabase db lint --linked`

Results:

- Local and remote migrations aligned.
- No schema errors found.
- Supabase CLI update available: installed `2.102.0`, latest reported `2.105.0`.

## Phase 0 Release Decision

**Do not deploy security-sensitive feature expansion before Phase 1.**

The current site builds and existing unit tests pass, but Phase 1 critical security fixes should be completed before treating Copilot actions, voice actions, cron/service-role functions, or admin operations as production-hardened.

## Safe Phase 1 Order

1. Add failing concurrency tests that demonstrate Copilot/voice request-state isolation requirements.
2. Refactor Copilot request state into immutable per-request context without changing tool behavior.
3. Add shared internal/admin authorization helpers and tests.
4. Apply authorization checks to the five listed privileged functions.
5. Re-run tests, build, lint, Supabase schema lint, and targeted authorization/concurrency tests.

