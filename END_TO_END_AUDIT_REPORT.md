# PrepLane End-to-End Product and Engineering Audit

Date: 2026-06-10  
Repository: `pgpcareerprep/preplane`  
Audited branch: `main` at `1fdaa91`  

## Executive Summary

PrepLane has a broad functional surface and a substantial amount of implemented product logic, but it is not yet safe to treat as a fully wired, reliable agentic operations platform. The largest risks are not cosmetic. They are inconsistent authorization rules, request state shared between concurrent Copilot users, privileged Edge Functions without function-level authorization, conflicting sheet-sync implementations, and business-critical allocation/matching logic without direct tests.

The application builds and its current unit tests pass, but those tests cover a small fraction of the highest-risk behavior. The production public routes tested behaved correctly, while authenticated end-to-end workflows could not be exercised without a test account.

### Overall Risk

| Area | Risk | Summary |
|---|---|---|
| Copilot and voice request isolation | Critical | Module-level mutable request identity can bleed between concurrent requests |
| Edge Function authorization | Critical | Several service-role functions lack internal auth/admin/cron-secret checks |
| RBAC and view-as | High | Frontend, Copilot, routes, and likely RLS express different rules |
| Sheet sync and data ownership | High | Multiple conflicting paths and divergent field maps |
| Process creation and allocation | High | Incorrect creator identity and contradictory allocation behavior |
| Mentor matching and sessions | High | Duplicated resolution logic and hardcoded scoring rules |
| Automated verification | High | No E2E/CI and no direct tests for core business workflows |
| Dependencies and maintainability | High | 17 dependency vulnerabilities and 626 lint warnings |

## What Was Tested

### Automated Checks

| Check | Result |
|---|---|
| `npm test` | Passed: 12 files, 86 tests |
| `npm run build` | Passed with CSS, browser-data, eval, and large-chunk warnings |
| `npm run lint` | Passed with 626 warnings and 0 errors |
| `npm audit --json` | 17 vulnerabilities: 1 critical, 9 high, 7 moderate |
| Supabase migration alignment | Local and linked migrations aligned through `20260609213000` |
| `supabase db lint --linked` | Could not complete due linked DB authentication failure |
| Production `/dashboard` unauthenticated | Correctly redirected to `/login?redirect=%2Fdashboard` |
| Production invalid feedback token | Correctly resolved to “Link not recognised” |

### Important Test Limitations

- No authenticated production test account was available, so create/edit/delete, role-specific views, Copilot actions, voice actions, sync controls, mentor assignment, and user-management workflows were not executed against production.
- No local Supabase stack or seeded E2E environment is provided.
- There is no browser E2E suite or CI workflow in the repository.
- Database policy linting could not be completed against the linked project.

## Critical Findings

### C-1. Copilot and Voice Copilot Share User Context Across Requests

Both Edge Functions describe their state as request-scoped but store it in module-level mutable variables. Supabase Edge Function isolates can serve overlapping requests, so one user's request can overwrite another user's role, user ID, impersonation state, plan, or cache while the first request is still running.

Evidence:

- `supabase/functions/copilot-ai/index.ts:917-947` stores `_reqCache` and `CURRENT_REQUEST` globally.
- `supabase/functions/copilot-ai/index.ts:3126-3134` mutates that global from each request.
- `supabase/functions/voice-copilot/index.ts:24-27` stores `CURRENT_VIEW_AS` and `CURRENT_VOICE_USER_ID` globally.
- `supabase/functions/voice-copilot/index.ts:727-754` mutates those globals per request.

Impact:

- Cross-user telemetry attribution.
- Incorrect RBAC decisions or view-as restrictions.
- Cross-request cached data or action-plan leakage.
- Potential writes executed with another request's context.

Required fix:

- Pass an immutable request context object through every tool/read/write call.
- Remove all module-level mutable request identity, plan, and cache state.
- Add a concurrency test that deliberately interleaves two users with different roles.

### C-2. Privileged Edge Functions Do Not Enforce Function-Level Authorization

Several functions create a service-role client but do not call `requireAuth`, verify an admin role, or validate a cron/internal secret. Even when Supabase gateway JWT verification is enabled, any authenticated user may be able to invoke privileged behavior.

Evidence:

- `progress-reminder-cron/index.ts:57-74` accepts `force_lmp_id` and immediately uses service role.
- `send-progress-confirmation-email/index.ts:21-48` accepts arbitrary recipient emails and uses service role.
- `sheets-backfill-lmp-id/index.ts:6` says “admin only,” but `:20-30` has no admin check.
- `sheets-retry-sweeper/index.ts:24-32` drains a privileged queue without an internal secret check.
- `send-test-reminder-email/index.ts:15-41` authenticates but lets any authenticated user send to an arbitrary address.

Impact:

- Email abuse/spam.
- Unauthorized sheet backfills and retry execution.
- Forced reminder runs and unintended service-role operations.

Required fix:

- Introduce shared `requireRole(["admin"])` and `requireInternalSecret()` helpers.
- Use a cron secret for scheduled/internal functions.
- Restrict test email recipients to the authenticated user unless admin.
- Add authorization integration tests for every Edge Function.

## High-Priority Findings

### H-1. RBAC Rules Contradict Each Other

Authorization is defined independently in frontend permissions, route gates, settings visibility, Copilot RBAC, database policies, and ad hoc component checks.

Examples:

- Frontend permits POCs to delete LMPs; Copilot backend permits only admins.
- Frontend permits POCs to edit company, role, type, and date; server-side writable fields differ.
- Frontend `view_settings` is admin-only, while `/settings` allows admin, allocator, and POC.
- `getLmpAccessLevel()` documents a `"none"` state but always returns at least `"summary"`.
- Copilot applies read-only protection during view-as, but other screens do not enforce one universal view-as read-only rule.

Evidence:

- `src/lib/permissions.ts:59-118`, `:141-168`, `:243-255`
- `supabase/functions/_shared/rbac.ts:28-45`
- `src/App.tsx:125-167`

Impact:

- UI presents actions that later fail.
- Users receive different access depending on entry point.
- Future policy changes are likely to update only one layer.

Required fix:

- Define one versioned permission contract and generate/use it in UI and Edge Functions.
- Make view-as universally read-only at the mutation boundary.
- Add a role/action/ownership test matrix against UI, Edge Functions, and RLS.

### H-2. Frontend and Backend Sheet Field Maps Are Divergent

Both files claim to be byte-identical mirrors, but they implement different Sheet-to-DB behavior.

- Frontend converts every `DB_TO_SHEET` header back into DB columns.
- Backend permits only `Comment` to flow Sheet-to-DB.

Evidence:

- `src/lib/sheets/fieldMap.ts:1-9`, `:90-138`
- `supabase/functions/_shared/fieldMap.ts:1-10`, `:82-92`

Impact:

- App writes and server sync can interpret identical patches differently.
- Future edits can silently create data corruption or unexpected writes.

Required fix:

- Move the canonical map to a generated/shared artifact.
- Explicitly separate app patch translation from external Sheet-to-DB permissions.
- Add a test that fails whenever frontend and Edge Function maps diverge.

### H-3. Sheet Sync Has Multiple Conflicting Sources of Truth

The code simultaneously describes Sheets as paused/no-op, operational/bidirectional, DB-to-Sheet-only, and immediately required during creation.

Observed paths include frontend sheet hooks, process-creation mirroring, DB triggers, `sheets-lmp`, `sync-ingest`, retry queues, retry sweeper, cron jobs, and Data Sources manual sync.

Evidence:

- `src/lib/sheets/hooks.ts:22-47` still implements polling and labels the tracker operational/bidirectional.
- `src/lib/createLmpProcess.ts:7-9` says creation must immediately reach Sheets.
- `src/lib/createLmpProcess.ts:191-204` actually performs the mirror in the background.
- Field-map comments say DB-to-Sheet except Comment.

Impact:

- Users can see DB success while Sheets is stale.
- Failures can be retried by multiple paths.
- It is difficult to identify the authoritative state and expected freshness.

Required fix:

- Declare DB as the sole source of truth.
- Use one durable outbox/queue for DB-to-Sheet.
- Make all sync status visible from one operational screen.
- Remove or clearly disable legacy frontend sheet read/write paths.

### H-4. Process Creation Stores the Role as the Creator/Allocator

`CreateLmpPage` passes `createdBy: role`, where role is `"admin"` or `"allocator"`. That value is then stored in `allocator` and may be stored in `jd_uploaded_by`.

Evidence:

- `src/pages/CreateLmpPage.tsx:21`, `:141-146`
- `src/lib/createLmpProcess.ts:159`, `:176`

Impact:

- Broken attribution and audit history.
- Rows can contain literal role names instead of a person/user ID.
- Ownership-based reporting and reminders may be wrong.

Required fix:

- Store stable authenticated user IDs for audit fields.
- Store POC profile IDs for operational ownership.
- Derive display names only for presentation/legacy mirror columns.

### H-5. POC Allocation Behavior Contradicts Its Specification

The allocation engine documents cross-domain fallback but refuses cross-domain allocation in the current flow. Path C is declared and scored but never returned by `detectPath()`. Existing company/role matches bypass load thresholds. Fuzzy name history matching accepts any shared token.

Evidence:

- `src/lib/pocAllocation.ts:4-20` documents cross-domain and Path C.
- `src/lib/pocAllocation.ts:89-92` says existing assignment wins regardless of load.
- `src/lib/pocAllocation.ts:143-151` makes Path C unreachable.
- `src/lib/pocAllocation.ts:217-223` uses global mutable alias resolver state.
- `src/lib/pocAllocation.ts:250-271` documents and implements ambiguous token matching.

Impact:

- “Best POC” behavior differs from product expectations.
- Over-capacity POCs can be assigned.
- Same-first-name POCs can receive incorrect history bonuses.
- Allocation results can vary based on component initialization order.

Required fix:

- Write an explicit allocation decision table and make code match it.
- Remove unreachable paths and global resolver state.
- Require stable IDs for history when available; treat ambiguous names as unresolved.
- Add exhaustive allocation tests for domain, load, history, threshold, and tie cases.

### H-6. Mentor Resolution and Session Logic Is Duplicated

A shared mentor resolver exists, but `MentorsTab` repeats ID/email/LinkedIn/name matching and upsert logic in multiple paths. The component also owns matching, registration, assignment, sessions, candidate stamping, and unassignment.

Evidence:

- Shared resolver: `src/lib/mentorResolver.ts:10-49`
- Duplicate paths: `src/components/lmp/detail/MentorsTab.tsx:593-667` and `:867-907`
- Hardcoded company tiers: `src/lib/mentorPipeline.ts:211-233`

Impact:

- Duplicate mentor records and inconsistent matching.
- High regression risk in a large stateful component.
- Business scoring changes require code deployments.

Required fix:

- Route all resolution through one service/RPC with database uniqueness constraints.
- Split mentor matching, assignment, session creation, and UI state.
- Move tier/scoring configuration to versioned database settings.

### H-7. Quota UI Is an Estimate, Not Enforced Provider Quota

The Copilot UI hardcodes provider totals and divides them by a hardcoded 15 users. It counts only the signed-in user's logged `copilot` usage, infers the active provider from the most recent model, and disables the composer when its calculated share is exhausted. This is not connected to actual provider account quota or dynamic active-user counts.

Evidence:

- `src/lib/hooks/useCopilotQuota.ts:4-9` hardcodes limits and 15 users.
- `src/lib/hooks/useCopilotQuota.ts:85-99` counts only locally logged user events.
- `src/lib/hooks/useCopilotQuota.ts:107-115` calculates a synthetic per-user limit.
- `src/pages/CopilotPage.tsx:725-739` blocks the UI based on that estimate.

Impact:

- Users can be blocked while provider quota remains.
- UI can show remaining capacity while provider quota is exhausted.
- Usage excludes voice and potentially failed/unlogged provider calls.

Required fix:

- Treat provider quotas, product budgets, and user budgets as separate concepts.
- Enforce user budgets server-side atomically.
- Fetch provider limits where supported; label estimates clearly otherwise.

## Medium-Priority Findings

### M-1. Settings and Routes Are Partially Wired

- `RoleOntologyPage` and `PrivacyPage` are stubs and are not routed.
- Parent settings route allows all roles while only some subroutes are gated.
- Data Sources route allows all roles, while the page contains administrative operations.
- Settings labels and visibility do not consistently reflect effective versus real role.

### M-2. Public Feedback Tokens Need Stronger Abuse Controls

The token flows correctly validate membership and duplicate submission, but public functions use service role and lack rate limiting. Tokens are stored and queried directly rather than as hashes.

Recommended:

- Store token hashes, add rate limits, validate payload schema/size, and add abuse telemetry.

### M-3. Environment and Branding Are Hardcoded

There are 63 references across the searched source/migrations to hardcoded production URL, old “LMP Magic” naming, Lovable, or Masters Union-specific values. Many Edge Functions hardcode `https://preplane.pages.dev`.

Impact:

- Preview/custom domains and environment promotion are brittle.
- Emails and CORS behavior can silently point to production.

Recommended:

- Centralize `APP_URL`, allowed origins, brand name, and sender configuration.

### M-4. Local Storage Holds Operational Configuration

External mentor discovery settings, caches, viewing state, mentor tab state, and other behavior rely on browser-local values. Some have DB backing, but inconsistent local state can produce different behavior per browser/user.

Recommended:

- Classify every local-storage key as UI preference, cache, or business configuration.
- Move business configuration to versioned server-side settings.

### M-5. Performance and Bundle Size

The build succeeds but reports large chunks, including the app shell, LMP guide, Add Candidates, Copilot, and XLSX bundles. There is also a CSS import-order warning and an eval warning from Bluebird.

Recommended:

- Lazy-load heavy workflows and XLSX functionality.
- Fix `src/index.css` import ordering.
- Add bundle budgets to CI.

## Feature-by-Feature Audit Matrix

| Feature | Status | Main Gaps |
|---|---|---|
| Authentication and route guards | Partially verified | Public redirect works; authenticated role matrix not E2E tested |
| View-as | Inconsistent | Copilot read-only, other screens use mixed real/effective role behavior |
| Dashboard | Wired, under-tested | No direct dashboard/E2E tests; depends on shared counting and role semantics |
| Data Sources | Overexposed/complex | Broad route access; sync behavior has multiple paths |
| Database and RLS | Needs policy audit | Migration history has overlapping policies/grants; linked DB lint unavailable |
| Settings | Partially wired | Stubs, inconsistent gates, local business configuration |
| Process creation | Functional with integrity bug | Creator/allocator attribution wrong; sheet mirror asynchronous |
| LMP views/actions | Broadly implemented | Permission mismatch and no E2E action matrix |
| POC data/domains | Broadly implemented | Identity/name fallback complexity; allocation domain behavior contradictory |
| POC allocation | High-risk | No tests, unreachable/dead path, threshold override, fuzzy ambiguity |
| Mentors | High-risk | Duplicate resolution logic and hardcoded scoring |
| Sessions/feedback | Partially verified | Invalid public token works; no authenticated session lifecycle E2E |
| Students | Wired, under-tested | No direct student access/action E2E suite |
| Sheet sync | High-risk | Conflicting ownership, maps, queues, and frontend paths |
| LMP Copilot | High-risk | Shared mutable request context, synthetic quota, broad untested agent surface |
| Voice Copilot | High-risk | Shared mutable context; conversational/action lifecycle not E2E tested |
| User management | Admin route exists | Invite/access lifecycle and role changes not E2E tested |
| Notifications/reminders | Authorization gaps | Service-role functions and arbitrary-recipient test email |

## Dead, Duplicate, or Misleading Code

- Allocation Path C remains in types/scoring/docs but cannot be selected.
- `SettingsStub` pages exist without active routing.
- Sheet hooks and comments describe behavior that conflicts with current DB-first design.
- Mentor resolution is implemented centrally and duplicated inside `MentorsTab`.
- Frontend/backend RBAC and field-map files claim synchronization but have drifted.
- Legacy naming and environment assumptions remain throughout active code.

## Dependency and Code Quality Findings

### Dependency Vulnerabilities

`npm audit` reported:

- 1 critical
- 9 high
- 7 moderate

Notable packages include Vitest, React Router, `xlsx`, Rollup, Vite/esbuild, lodash, minimatch, glob, PostCSS, YAML, and AJV. `xlsx` currently has no npm-provided fix in the audit result and should be isolated/replaced or risk-accepted explicitly.

### Lint and Type Safety

Lint completed with 626 warnings. The dominant issue is pervasive `any`, including sensitive data and mutation paths. There is also at least one hook dependency warning. A passing lint command therefore does not currently indicate a clean or low-risk codebase.

### Test Coverage

The 86 passing tests are useful but do not directly cover:

- POC allocation
- Mentor pipeline/matching/resolution
- Role and field permission matrices
- View-as mutation safety
- Process creation identity
- Sheets sync/retry behavior
- Voice Copilot
- Copilot concurrent-request isolation
- Edge Function authorization
- Database RLS integration
- Authenticated browser workflows

## Recommended Remediation Sequence

### Phase 0: Immediate Security and Data Integrity

1. Remove module-level mutable request state from both Copilot Edge Functions.
2. Add function-level admin/internal authorization to service-role Edge Functions.
3. Restrict arbitrary-recipient email functions.
4. Fix process creator/allocator identity.
5. Establish and test one RBAC contract across UI, Edge Functions, and RLS.

### Phase 1: Make Core Operations Deterministic

1. Consolidate sheet sync around a DB outbox and one worker.
2. Generate one canonical sheet field map.
3. Rewrite allocation behavior against an approved decision table and add tests.
4. Consolidate mentor identity resolution and enforce uniqueness in DB.
5. Separate provider quota, product budget, and user budget; enforce budgets server-side.

### Phase 2: Verification and Operational Readiness

1. Add seeded local/staging Supabase environment.
2. Add Playwright E2E tests for each role and critical workflow.
3. Add Edge Function authorization and concurrency integration tests.
4. Add CI for test, lint, build, migration checks, dependency audit, and bundle budgets.
5. Run and remediate linked database lint/RLS policy audit.

### Phase 3: Cleanup and Product Consistency

1. Remove dead/stub routes and obsolete logic.
2. Centralize environment and branding configuration.
3. Reduce lint warnings and replace risky `any` usage.
4. Break large workflow components into tested domain services and smaller UI components.

## Definition of Done for a Reliable Release

- Every role/action/field/ownership combination has an automated expected result.
- View-as cannot mutate through any UI, RPC, or Edge Function.
- Two simultaneous Copilot/voice users cannot share context or data.
- Every service-role function rejects unauthorized direct invocation.
- Process creation, allocation, mentor assignment, session lifecycle, feedback, and sync pass browser E2E tests.
- Sheet sync has one documented source of truth and recoverable failure path.
- CI blocks regressions, dependency critical/high vulnerabilities are resolved or explicitly accepted, and linked DB policy lint passes.

