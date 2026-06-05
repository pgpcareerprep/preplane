# MentorMatch AI — Complete Lovable Build Prompts
### Lumina Design System · Step-by-Step · Admin → Moderator → POC

---

> **How to use this document:** Each section is a self-contained prompt to paste directly into Lovable. Run them in order. Each prompt builds on the previous. Never skip a step — later prompts reference components created in earlier ones.

---

## PRE-FLIGHT: Design System Foundation
### Paste this FIRST before any view prompt

```
DESIGN SYSTEM SETUP — PASTE THIS AS YOUR FIRST PROMPT

You are building MentorMatch AI using the Lumina v1.0 design system. Before writing any component, internalize and apply every rule below. This governs every screen in this project.

━━━ FONTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Primary: Galano Grotesque (Google Fonts) — headings, body, UI, numbers
Accent: Fraunces italic — hero taglines, pull quotes ONLY (max 2/page, never in tables/nav/forms)

Add to index.html:
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@1,400;1,700&display=swap" rel="stylesheet">
Use Galano Grotesque via @font-face or nearest equivalent (DM Sans as fallback).

━━━ COLOR TOKENS (apply as CSS variables on :root) ━━━━━━━━━━
--orange-50: #FFF3E8   --orange-100: #FFE0BB  --orange-200: #FFC07A
--orange-400: #F0A050  --orange-500: #E38330  --orange-600: #C06820
--yellow-400: #F7D344  --yellow-500: #F4C641
--coral-400: #F07040   --sage-400: #6A9E62    --sky-400: #4A8EE8
--plum-400: #8B5CF6    --teal-400: #39B6D8
--n50: #FAFAF8   --n100: #F4F3EF  --n200: #E8E5DC  --n300: #D4D0C4
--n400: #A8A398  --n500: #7A756C  --n600: #5C594F  --n700: #3D3B35
--n800: #2A2822  --n900: #1A1916  --white: #FFFFFF

━━━ COLOR USAGE RULES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
orange-500 → Primary CTA buttons, AI actions, key emphasis (1 per view MAX)
yellow-400 → Active nav item fill, selected states (1–2 elements max)
sage-400   → Success, completed states, Converted status
coral-400  → Errors, destructive, Not Converted, Rejected
plum-400   → AI processing badges ONLY — exclusive to AI features
teal-400   → Mentor Union badge, Ongoing LMP status
sky-400    → External badge, info tooltips, external links
n900       → Sidebar background, table headers, display headings
n50        → Page background (never pure white)

━━━ TYPOGRAPHY SCALE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
H1: 48px Bold, tracking -2px, line-height 1.1 — page section titles
H2: 36px Bold, tracking -1px, line-height 1.15 — feature headers
H3: 28px SemiBold, tracking -0.5px — card titles
H4: 20px Medium — group labels, table headers
H5: 16px Medium — component labels, nav items
Body L: 16px Regular, line-height 1.65
Body: 14px Regular, line-height 1.6 — standard UI text
Body S: 13px Regular — hints, secondary text
Caption: 11px Regular — timestamps, metadata
Label: 11px Medium, tracking +0.5px UPPERCASE

━━━ 8PT GRID & SPACING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4px / 8px / 12px / 16px / 20px / 24px / 32px / 40px / 48px / 64px
Sidebar: 260px fixed. Content area: 1140px. Forms: 680px max. Modals: 400/560/720px.
Page background: n50 (#FAFAF8). Never pure white.

━━━ SHADOWS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
shadow-sm: 0 1px 3px rgba(26,25,22,.06), 0 1px 2px rgba(26,25,22,.04)
shadow-md: 0 4px 16px rgba(26,25,22,.08), 0 2px 6px rgba(26,25,22,.05)
shadow-lg: 0 8px 32px rgba(26,25,22,.10), 0 4px 12px rgba(26,25,22,.06)
shadow-xl: 0 16px 48px rgba(26,25,22,.12), 0 8px 24px rgba(26,25,22,.07)
focus-ring: 0 0 0 3px rgba(227,131,48,.15)

━━━ BORDER RADIUS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4px (xs) / 6px (sm) / 10px (md) / 16px (lg) / 24px (xl)
Cards: 16px. Inputs: 10px. Buttons: 10px default. Badges/pills: 100px full.

━━━ CARD SPECS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Base card: bg-white, border 0.5px n200, radius 16px, shadow-sm
Hover state: shadow-md + border n300
Metric card: dense 14px padding, 6px radius, number 32-48px bold orange-500
AI output card: bg-n100, left border 3px orange-500

━━━ BUTTON SYSTEM ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Primary: bg-n900, text-white, hover bg darken slightly, radius 10px, 14px font
Accent/CTA: bg-orange-500, text-white, hover bg-orange-600
Secondary: bg-white, text-n800, border n300, hover bg-n100
Ghost: transparent bg, text-n600, hover bg-n50
Danger: bg-coral-50, text-coral-600, border coral-200
Disabled: bg-n100, text-n400, cursor-not-allowed
Sizes: SM (7px 14px padding, 13px font) · MD (9px 18px, 14px) · LG (12px 24px, 16px)

━━━ INPUT SYSTEM ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Default: bg-white, border 0.5px n300, radius 10px, height 36px, 14px font
Focus: border orange-400 1px, box-shadow focus-ring
Error: border coral-400, shadow coral focus-ring
Labels: 13px font-medium n600, always above input, never floating

━━━ SIDEBAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Width: 260px fixed. Background: n900 (#1A1916).
Logo top-left in orange-500.
Active nav item: bg-yellow-400, left border 3px orange-500, text-n900.
Inactive: text-n400, hover text-white.
Role-scoped: hide items that don't apply — never grey them out.
Nav groups: WORKSPACE (Dashboard, Requisitions, LMP, etc.) | ADMIN | ACCOUNT

━━━ ANIMATION TOKENS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ease-smooth: cubic-bezier(.4,0,.2,1) — standard transitions
ease-enter: cubic-bezier(0,0,.2,1) — elements entering
ease-exit: cubic-bezier(.4,0,1,1) — elements leaving
ease-spring: cubic-bezier(.34,1.56,.64,1) — micro bounces, toggles
Durations: 80ms (instant) · 150ms (fast) · 220ms (normal) · 350ms (slow) · 450ms (page)
Rule: Functional motion only. Max 450ms. Never animate more than 3 elements simultaneously.
Prefers-reduced-motion: reduce all to 30ms opacity-only.

━━━ STATUS PILLS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Font: 11px uppercase medium, tracking +0.5px, radius 100px, padding 3px 10px
Ongoing: bg-teal-50, text-teal-600, border teal-200
Dormant: bg-yellow-50, text-yellow-600, border yellow-200
Hold: bg-n100, text-n600, border n200
Converted: bg-sage-50, text-sage-600, border sage-200
Not Converted: bg-coral-50, text-coral-600, border coral-200
Closed: bg-n200, text-n600, border n300

━━━ TECH STACK ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
React + TypeScript + Tailwind CSS
shadcn/ui + Radix UI primitives
Framer Motion (all animations)
Recharts (all charts)
@dnd-kit/core (drag and drop)
TanStack Table (data grids)
TanStack Query (data fetching)
Zustand (client state)
React Hook Form (all forms)
Lucide React (icons — outline style, 1.5px stroke, 24px grid)
Clerk (auth — 3 roles: moderator | poc | admin)

━━━ GLOBAL RULES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Page background: always n50 (#FAFAF8)
- Never use pure white (#FFFFFF) as a page background
- orange-500 appears ONCE per view as the primary action — not repeated
- Fraunces italic: max 2 per page, never in tables/nav/data
- Heading hierarchy sequential — never skip H2 to H4
- Minimum text size in dashboards: 12px
- WCAG AA: 4.5:1 contrast for all text
- Focus rings: always visible (orange 3px ring)
- Color is never the sole differentiator — always pair with icon/label
- Tables and data surfaces: NEVER use blur — solid surfaces only
- Bento grids: primary KPI block spans at least 2× supporting metrics
```

---

## PROMPT 01 — App Shell, Routing & Sidebar

```
Build the MentorMatch AI application shell. This is the persistent chrome that wraps all views.

━━━ SIDEBAR (260px fixed, bg-n900 #1A1916) ━━━━━━━━━━━━━━━━
Top: "MentorMatch" wordmark in orange-500 (#E38330), 16px bold, left-padded 20px, 64px top section
Below logo: user avatar (32px circle) + name + role badge (orange-500 for Moderator, teal for POC, plum for Admin)

NAV GROUPS with 11px uppercase label (n600, tracking +0.5px), 8px margin-top before each:
WORKSPACE:
  - Dashboard (LayoutDashboard icon)
  - Requisitions (FileText icon)
  - Create Req (PlusCircle icon) — HIDDEN for POC and Admin
  - Last Mile Prep (Target icon)
  - Mentor Feedback (MessageSquare icon) — HIDDEN for Admin and Moderator on this item
  - Analytics (BarChart2 icon)

ADMIN (only visible when role = admin):
  - Admin Panel (Shield icon)
  - Data Sources (Database icon)

ACCOUNT:
  - Settings (Settings icon)

Active nav item styles:
  bg-yellow-400 (#F7D344), left border 3px solid orange-500, text-n900, font-medium
  Transition: 150ms ease-smooth on all properties

Inactive: text-n500, hover: text-white + bg-n800, transition 150ms

Bottom of sidebar: version tag "v1.0" in n600, 11px

━━━ TOPBAR (full width minus sidebar, height 60px) ━━━━━━━━
bg-white, border-bottom 0.5px n200, shadow-sm
Left: Page title (H4, n800, font-medium) — updates per route
Right: Search button (ghost, 13px) + Notifications bell (icon, relative badge dot orange-500) + User avatar dropdown

━━━ MAIN CONTENT AREA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bg-n50 (#FAFAF8), padding 32px, min-height 100vh minus topbar
Content max-width: 1140px

━━━ ROUTING SETUP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Create routes/pages (empty placeholder views for now, we'll fill each):
/ → redirect to /dashboard
/dashboard → DashboardPage (role-scoped)
/requisitions → RequisitionsPage
/requisitions/new → CreateRequisitionPage
/requisitions/:id → RequisitionDetailPage
/lmp → LMPBoardPage
/lmp/:id → LMPDetailPage
/data-sources → DataSourcesPage
/settings → SettingsPage
/analytics → AnalyticsPage

━━━ ROLE CONTEXT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Create a useRole() hook returning { role: 'moderator' | 'poc' | 'admin', user: {...} }
Mock with role = 'admin' initially — we'll switch as we build each view
Create a <RoleGate role="moderator"> wrapper component that hides children from other roles

━━━ ANIMATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Page transitions: Framer Motion AnimatePresence, opacity 0→1 + y:8→0, 220ms ease-enter
Nav item active change: 150ms bg fill transition
Sidebar: static (no collapse in MVP)
```

---

## PROMPT 02 — Admin Dashboard

```
Build the ADMIN DASHBOARD at /dashboard (when role = admin).
Switch role context to 'admin' for this prompt.

━━━ PAGE HEADER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
H2 "Admin Overview" (n900, 36px bold)
Subtitle: "Platform configuration, data health, and user management" (n500, 14px)
Right: orange-500 CTA button "Manage Users" with UserPlus icon

━━━ KPI BENTO ROW (4 cards, 12px gap) ━━━━━━━━━━━━━━━━━━━━
Each card: bg-white, radius 16px, padding 20px, shadow-sm, border 0.5px n200
Hover: shadow-md, transition 220ms

Card 1 — SPAN 2 (primary hero block):
  Label: "Total Platform Reqs" (11px uppercase n500)
  Number: 128 (48px bold n900)
  Delta: +12 this month (13px sage-400 with TrendingUp icon)
  Subtext: "Across 3 moderators" (12px n400)

Card 2: Active POCs
  Number: 9, label "Active POCs", subtext "2 near threshold"
  Coral dot on "2 near threshold"

Card 3: Data Sources
  Number: 3, label "Sources Active", MU + Alumni + External source chips below

Card 4: Mentor Pool
  Number: 847, label "Total Mentors", breakdown: MU 420 · ALU 234 · EXT 193 in 11px

━━━ POC WORKLOAD HEATMAP (below KPI row) ━━━━━━━━━━━━━━━━━
Card: full width, bg-white, radius 16px, padding 24px
H4 "POC Workload vs Threshold" + tooltip icon
TanStack Table with columns:
  POC Name (avatar 28px + name) | Domain | Active Reqs | Max Threshold | Load % | Health | Actions
  
Load % shown as segmented bar (180px wide):
  0–60%: sage-400 fill
  60–85%: yellow-400 fill  
  85–100%: coral-400 fill
  Bar background: n200, radius 100px, height 6px

Health indicator: 8px dot
  Healthy: sage-400 dot | Slow: yellow-400 dot | Stuck: coral-400 dot

Actions: "Configure" ghost button (sm)

Row hover: bg-n50 transition 150ms

━━━ BOTTOM GRID (2-col, 24px gap) ━━━━━━━━━━━━━━━━━━━━━━━━
Left card (60%): "Data Source Health"
  3 source rows: Mentor Union | Alumni DB | Student DB
  Each row: source icon (colored by type) + name + last sync time + record count + status dot
  Status: teal (synced) / yellow (stale >7 days) / coral (error)
  "Re-sync" ghost button on each row
  Bottom: "Upload CSV" orange-500 accent button

Right card (40%): "Scoring Config Summary"
  Show current weight donut chart (Recharts) using orange/teal/plum/sage/sky for 5 signals
  Labels: Role 35% · Skills 25% · Company 15% · Industry 15% · Seniority 10%
  Below chart: "Edit Weights →" link in orange-500

━━━ ADMIN QUICK ACTIONS ROW ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5 ghost cards in a row, 12px gap, radius 12px, border dashed n300, hover border n400
Icons: Users, Database, Scale, FileCode, Sliders
Labels: Manage Users · Data Sources · Scoring · Role Ontology · POC Config
Each is a nav link to the corresponding settings route
Hover: bg-white, shadow-sm, border n300 solid, scale 1.02 (ease-spring 220ms)

━━━ MOTION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Stagger bento cards in with Framer Motion: each card delay 60ms, y:16→0 opacity 0→1 (350ms ease-enter)
KPI numbers count up from 0 on mount: 600ms ease-out
```

---

## PROMPT 03 — Admin Settings Pages

```
Build the ADMIN SETTINGS section. Route: /settings with tabbed sub-routes.

━━━ SETTINGS LAYOUT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2-column layout: left nav 260px + right content 680px max
Left nav: sticky, bg-white, radius 16px, border 0.5px n200, shadow-sm, padding 16px
Nav items: 14px, n700, radius 8px, padding 10px 12px
Active: bg-orange-50, text-orange-600, font-medium, left border 3px orange-500

Nav items:
  - General (Settings icon)
  - Scoring Weights (Scale icon)
  - POC Domain Config (Users icon)
  - Role Ontology (GitBranch icon)
  - Feedback Forms (ClipboardList icon)
  - User Management (UserCog icon)
  - Data Sources (Database icon)
  - Privacy (Shield icon)

━━━ TAB: SCORING WEIGHTS (/settings/scoring) ━━━━━━━━━━━━━
H3 "Matching Score Weights" + "These weights apply to all future mentor matches" (n500, 13px)

5 sliders in a card (bg-white, radius 16px, padding 24px):
  Each slider row:
    Label (14px medium n700) + current % value (14px bold orange-500) on same line
    Colored progress bar slider: 100% width, height 6px, thumb 18px circle orange-500
    Helper text: 12px n400 describing the signal
    
  Role Match — 35% — "Measures how closely the mentor's role aligns with the JD role"
  Skills Overlap — 25% — "Jaccard similarity between mentor skills and JD required skills"
  Company Match — 15% — "Whether mentor worked at the target company"
  Industry Match — 15% — "Sector and vertical alignment"
  Seniority Match — 10% — "Level proximity between mentor and JD seniority"

Live Donut chart (Recharts, 180px, right side of card):
  5 segments in: orange-500, teal-400, plum-400, sky-400, sage-400
  Center: "100%" in 20px bold n900
  Updates live as sliders move
  Validation: if weights don't sum to 100%, show coral-400 warning "Must sum to 100%"

Preset buttons row: "Balanced (Default)" · "Skills-Heavy" · "Role-Heavy" · "Company-Focused"
Each as secondary button, clicking applies a preset to all sliders with 350ms Framer spring animation

Sparse JD Override section (collapsible):
  Title: "Basic Info Mode Overrides" (H5) + ChevronDown icon
  Same 4 sliders for sparse mode: Role 50%, Skills 30%, Industry 10%, Seniority 10%

Save button: full-width orange-500 CTA "Save Scoring Config" at bottom

━━━ TAB: POC DOMAIN CONFIG (/settings/poc-domains) ━━━━━━━━
H3 "POC Domain Assignments"
TanStack Table: POC Name | Domains | Max Threshold | Current Load | Actions
"+ Add Domain" inline in Domains cell — chips with ×remove, teal bg
Threshold: number input with +/- stepper, default 12
Edit row: slide-open inline edit form (Framer height animation 350ms)

Below table: 5-signal weight config card (same slider pattern as Scoring tab but for POC assignment signals)
Domain Match 50% · Workload 20% · Skill Match 15% · Conversion Rate 10% · Recency 5%

━━━ TAB: USER MANAGEMENT (/settings/users) ━━━━━━━━━━━━━━━
H3 "User Management"
Search input (full-width, magnifier icon left, clearable)
Filter pills: All | Moderators | POCs | Admins — clicking filters table, pill fills orange-50 border orange-500

TanStack Table: Avatar+Name | Email | Role pill | Domains (POC only) | Status | Last Active | Actions
Role pill colors: Moderator=orange, POC=teal, Admin=plum
Status: Active (sage dot) / Inactive (n400 dot)
Actions: Edit (ghost) | Deactivate (danger, confirmation dialog before action)

"Invite User" button — orange CTA top-right
Opens 560px modal:
  Name + Email fields
  Role dropdown: Moderator / POC / Admin
  If POC selected: reveal domain multi-select + threshold input (Framer height animation)
  "Send Invite" orange CTA full-width
```

---

## PROMPT 04 — Admin Data Sources

```
Build the DATA SOURCES hub at /data-sources.

━━━ PAGE HEADER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
H2 "Data Sources"
Subtitle: "Manage mentor pools, student records, and external discovery"
Right: "Sync All" secondary button with RefreshCw icon

━━━ SOURCE CARDS (2-col grid, 24px gap) ━━━━━━━━━━━━━━━━━━
Each card: bg-white, radius 16px, padding 24px, shadow-sm, border 0.5px n200

CARD 1: Mentor Union
Header: teal-400 icon (Users) + "Mentor Union" (H4) + [Teal badge "MU"]
Stats row: 420 mentors · Last sync Apr 24 · v3 active
Status: "Synced" sage dot + text
Body: mini table showing columns: Name / Role / Company / Rating / Skills — first 3 rows preview
Actions row: "Upload CSV" (orange-500 CTA) + "View All Mentors →" (ghost)
Upload zone (hidden, reveals on click): dashed orange border, drag-drop, progress bar on upload

CARD 2: Alumni Database  
Header: sage-400 icon + "Alumni DB" + [Sage badge "ALU"]
Stats: 234 records · Last upload Mar 15
Column mapping status: "Mapped ✓" (sage) for each standard column
Actions: "Upload CSV/XLSX" CTA + "Column Mapping →" ghost

CARD 3: Student Database
Header: sky-400 icon + "Student DB" + [Sky badge "NEW"]
Stats: 892 students · Cohort 2025
Table preview: Name / Email / Cohort / CV status (parsed ✓ or pending)
Actions: "Upload Student CSV" CTA + "View Records →" ghost

CARD 4: External Discovery (full-width)
Header: n900 icon (Globe) + "External Discovery" + [n400 badge "EXT"]
Toggle row for each platform: TopMate, ADPList, LinkedIn (with mentor signal)
Toggle uses orange-500 when active, n300 when off (18×28px pill toggle)
Config fields (visible only when enabled):
  Confidence Threshold: range slider 0–100%, default 70%
  Max Results: number input, default 20
  Dedup: checkbox "Remove duplicates across sources"
"Test Discovery" secondary button — shows modal with sample API result

━━━ VERSION HISTORY DRAWER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Right-side drawer (400px) triggered by "View History" on each card
Timeline list: each version row: v# · Date · Record count · "Active" badge on latest · "Restore" ghost button
Drawer uses: bg-white, shadow-xl, overlay bg rgba(26,25,22,0.5) with blur(4px)
Enter: x:400→0 (350ms ease-enter) | Exit: x:0→400 (220ms ease-exit)
```

---

## PROMPT 05 — Moderator Dashboard

```
Switch role context to 'moderator'.
Build the MODERATOR DASHBOARD at /dashboard.

━━━ PAGE HEADER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
H2 "Dashboard" (n900)
Subtitle: "Good morning, [Name]. Here's your platform overview." (n500, 14px)
Right: Primary orange-500 CTA "Create Requisition" with Plus icon (LG size)

━━━ KPI BENTO (5 stats, first spans 2 cols) ━━━━━━━━━━━━━━━
12px gap grid. Cards: bg-white, radius 16px, shadow-sm, border 0.5px n200

Hero KPI (span-2): "Open Requisitions"
  48px bold n900 number: 18
  Sage delta: +3 this week (TrendingUp icon)
  Sparkline (Recharts tiny line chart) last 7 days in orange-500/15% fill below number

Stat 2: Active POCs — number 9, caption "across 5 domains", plum dot for 2 near threshold
Stat 3: CVs Uploaded — number 142, caption "+28 this week"
Stat 4: Mentor Sessions — number 34, caption "this month", teal accent
Stat 5: Conversions — number 11, large %, sage-400 number color

━━━ POC WORKLOAD TABLE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Card: bg-white, radius 16px, padding 24px
H4 "POC Workload" + "Manage →" orange link right

TanStack Table (compact density, 12px row gap):
  POC (avatar 28px + name) | Domain chips | Active / Max | Load bar | Health dot | Action

Load bar: same segmented bar as admin (sage/yellow/coral based on %)
Health: 8px dot, sage=Healthy, yellow=Slow, coral=Stuck
Action: "View Reqs →" ghost button sm

Row alternating: odd rows bg-n50 for scannability

━━━ PIPELINE STATUS CHART + SLA ALERTS (2-col, 24px gap) ━━
Left (60%): "Pipeline by Status" — Recharts grouped bar chart
  X-axis: last 6 weeks labels. Y-axis: req count
  Bar colors per status: teal Ongoing, yellow Dormant, n400 Hold, orange Converted, coral Not Converted
  Legend below chart, 12px labels

Right (40%): "SLA Alerts" card
  H4 "Requires Attention" + coral count badge
  List of reqs >14 days inactive:
    Each row: Role@Company (13px bold n800) + "21 days" coral chip + POC avatar + "Log Process" ghost btn
  Empty state: sage checkmark illustration + "All reqs on track" (Fraunces italic accent text this once)

━━━ SMART NUDGES ROW ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
H4 "Smart Nudges" (n800) + "Dismiss All" ghost right
Horizontal scroll row of nudge cards (280px each, can overflow with scroll):
  Card: bg-orange-50, border orange-200, radius 12px, padding 16px
  Icon: orange-500 Zap icon
  Title: 14px medium n800
  Body: 13px n600
  CTA: orange-500 ghost link "Take Action →"

Nudge examples:
- "3 reqs have no mentor match yet — Run matching now"
- "PM @ Zomato has been Dormant for 18 days"
- "2 sessions awaiting your confirmation"
- "Priya Sharma is at 91% of her req threshold"

━━━ RECENT ACTIVITY TABLE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Card: bg-white, full-width, radius 16px, padding 24px
H4 "Recent Requisitions" + "View All →" link
TanStack Table — compact: Role | Company | Domain | POC | Candidates | Status pill | View →
Last 10 reqs. Sortable columns. Row hover: bg-n50.

━━━ MOTION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Bento stagger: each card 60ms delay, y:16→0, opacity 0→1
KPI numbers count up: 600ms ease-out
Nudge cards: horizontal entrance, x:-20→0 stagger 80ms each
```

---

## PROMPT 06 — Create Requisition (3 Modes)

```
Build the CREATE REQUISITION page at /requisitions/new.
Moderator only. 3-step wizard.

━━━ WIZARD PROGRESS HEADER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3-step indicator: [1 JD Input] → [2 Review & POC] → [3 Add Candidates]
Active step: orange-500 filled circle + label. Completed: sage-400 checkmark. Upcoming: n300.
Progress connector line: orange-500 filled up to current step.
Card: bg-white, radius 16px, shadow-sm, 680px max-width, centered, padding 32px

━━━ STEP 1: JD INPUT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
H3 "Job Description Input" (n900)
3 tab buttons at top (Mode selector):
  Tab: Upload File | Paste Text | Basic Info Only
  Active tab: bg-orange-50, text-orange-600, border-bottom 2px orange-500
  Tabs use ease-smooth 150ms transition

MODE 1 — Upload File:
  Drop zone: 200px height, border 2px dashed n300, radius 12px, center column layout
  Upload icon (cloud-upload, 40px, n400) + "Drag & drop your JD file" (14px n600)
  "+ PDF, DOCX, TXT · Max 10MB" (12px n400)
  Hover: border orange-500, bg orange-50
  On file drop: animate border to orange-500 (150ms), show filename + size
  
  Progress states (Framer AnimatePresence transitions, 220ms each):
    Uploading: orange progress bar (indeterminate pulse)
    Extracting: "Extracting text..." + plum badge with 3-dot stagger loader
    AI Parsing: "AI analyzing JD..." + plum badge pulsing, animated dots cycle n400→orange-500→plum-400
    Complete: sage-400 checkmark badge "Parsed successfully"
    Error: coral border + "Parse failed · Try again" button

MODE 2 — Paste Text:
  Textarea: min-height 200px, same input styling, placeholder "Paste the full job description here..."
  Character counter: bottom-right, 13px n400 "0 / 5000"
  Auto-parse trigger: 2s after last keystroke. Show plum "Analyzing..." badge.
  If <100 words: yellow-400 inline warning "Short description — some fields may be incomplete"

MODE 3 — Basic Info Only:
  3 fields: Role Title (text) + Company Name (text) + Domain (select dropdown)
  Optional group (collapsible): Seniority · Location · Known Skills (tag input)
  Tag input: chips with × remove, text input at end, enter to add
  Info banner: sky-400 bg, info icon: "No AI parsing — POC assignment still runs on domain + workload"

━━━ AI PREVIEW PANEL (slides in after parse, all modes) ━━
Framer: height 0→auto (350ms ease-enter) + opacity 0→1
Card: bg-n100, left border 3px orange-500, radius 12px, padding 20px
Header: Zap icon (plum) + "AI Parsed Results" + confidence chip (e.g., "94% confident" sage-400 bg)

Field chips row 1: Role chip + Company chip + Domain chip + Seniority badge
Field chips: bg-white, border n200, radius 8px, padding 4px 10px, 13px n700
Each chip: label in 10px uppercase n400 above + value in 13px medium n800

Skills section: "Required Skills" label + tag pills (bg-orange-50, border orange-200, text orange-700)
             + "Preferred Skills" + tag pills (bg-n100, border n200, text n600)

"Edit fields" toggle link (orange-500, 13px): reveals inline edit form for all fields
Edit form: standard inputs, confirm/cancel below

"Continue to POC Review →" button: orange-500 CTA, full-width, LG size, at bottom
Disabled until required fields filled.

━━━ STEP 2: POC REVIEW & ASSIGNMENT ━━━━━━━━━━━━━━━━━━━━━━
H3 "AI POC Suggestion" (n900)
Domain matched: "Product Management" (teal chip)

3 ranked POC cards:
  RANK 1 card: bg-white, radius 12px, shadow-md, border 2px orange-200 (highlighted), padding 20px
  RANK 2+: bg-white, radius 12px, shadow-sm, border n200, padding 20px

  Each card layout:
    Left: 40px avatar circle (colored initials) + Rank badge (14px bold, orange-500 "RANK 1")
    Center: Name (15px bold n900) + Role/Domain (13px n500)
    Right: Score bubble (48px circle, bg-orange-50 border orange-200): score number 20px bold orange-500 + "/100" 11px
    
    Signal row below (5 small chips): Domain ✓ | Load 6/12 | Skills 4/6 | Conv 78% | Active ✓
    Each chip: 11px, rounded, color-coded (sage=good, yellow=medium, coral=low)
    
    Rationale text: "Strong domain match. Moderate load. High historical conversion." (13px italic n600)
    
    Rank 1: "Confirm This POC →" orange-500 full-width CTA
    Rank 2+: "Assign Instead" secondary button

  Below cards: 
    "Or choose any POC:" combobox dropdown (all eligible POCs)
    "+ Add a second POC" ghost button with Plus icon
    "Skip — assign later" ghost link (small, n500)

━━━ STEP 3: ADD CANDIDATES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
H3 "Upload Candidate CVs" (optional step)
Upload zone: same as Mode 1 file upload but multi-file, max 20, 5MB each

Parse queue table (appears after files dropped):
  # | Filename | Status | Parsed Name | Actions
  Status: Queued (n400) | Parsing (plum pulse dot) | Done (sage ✓) | Error (coral ✗)

Dedup alert (if triggered): yellow banner "Duplicate detected: Arjun Mehta" with Merge/Keep Both/Replace actions

"Add X Candidates to Req →" orange CTA (count updates live)
"Skip for now" ghost link below button
```

---

## PROMPT 07 — Requisition Board (Moderator View)

```
Build the REQUISITION BOARD at /requisitions (Moderator view).

━━━ PAGE HEADER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
H2 "Requisitions" (n900)
Right: "Create Requisition" orange CTA + count badge "18 total" n600

━━━ FILTER BAR (bg-white, radius 12px, padding 16px, shadow-sm) ━━
Row of filters:
  Search: full-width input left, SearchIcon, placeholder "Search role, company, POC..."
  Filter row: Company dropdown | Domain dropdown | POC dropdown | Status dropdown | Clear Filters ghost

Each filter dropdown: 36px height, n300 border, radius 10px, 13px font
Active filter: border orange-400, bg-orange-50 background tint
Clear pill: shows when filters active, coral-50 bg, × icon, "3 filters" label

━━━ REQ CARD GRID (3-col desktop, 24px gap) ━━━━━━━━━━━━━━
Each card: bg-white, radius 16px, shadow-sm, border 0.5px n200, padding 20px
Hover: shadow-md, border n300, transition 220ms
Framer stagger entrance: each card y:12→0 opacity 0→1, 60ms delay increments

CARD STRUCTURE:
  Top row: 
    Overall status pill (left) — Ongoing teal | Hold n400 | Converted sage | etc.
    Process stage chip (right) — e.g., "R2 — Technical" bg-n100 text-n600 border n200

  Company + Role (H4, n900): "Product Manager @ Swiggy"
  Domain + Seniority: "Product Management · Mid-Senior" (13px n500)
  
  Divider: 0.5px n200

  POC row: 
    "Primary POC:" label (11px n400) + avatar circle (28px, colored initials, orange ring) + name
    "+ Secondary:" if exists + avatar
  
  Stats row (3 items with Lucide icons):
    Users icon + "5 Candidates"
    Clock icon + SLA days + color: <14 days sage · 14–30 yellow · >30 coral
    Calendar icon + creation date (13px n400)
  
  Divider: 0.5px n200
  
  Actions row (Moderator-only additions):
    "Edit POC ✎" ghost button sm
    "Add Candidates +" ghost button sm  
    "View Details →" primary (n900) button sm, right-aligned

━━━ EMPTY STATE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Center-aligned, padding 80px
Large FileText icon (64px, n300)
"No requisitions yet" H3 n800
"Create your first requisition to get started" Body n500
"Create Requisition" orange CTA button

━━━ EDIT POC MODAL (560px) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Triggers from "Edit POC" button
Same AI POC suggestion UI from Step 2 of Create Req flow
Current POC shown at top with "Current Assignment" label
Can replace, add secondary, or remove secondary
"Update POC Assignment" orange CTA · "Cancel" ghost
Modal: shadow-xl, radius 16px, backdrop blur(20px) + rgba(26,25,22,0.6) overlay
Enter: scale 0.95→1 + opacity 0→1 (350ms ease-enter)
```

---

## PROMPT 08 — Requisition Detail (5 Tabs)

```
Build the REQUISITION DETAIL page at /requisitions/:id.

━━━ STICKY HEADER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Position sticky, top 0, z-index 40, bg-white, border-bottom 0.5px n200, shadow-sm
Padding: 16px 32px
Left column:
  H3 "Product Manager @ Zomato" (n900, 28px)
  Row: "3 Candidates" (n500) · separator dot · "Stage: R2 — Technical" chip (n100 bg) · Status pill
Right column:
  POC avatars (28px circles, stacked with -8px overlap, up to 3 + "+N more")
  "▶ Run Mentor Match" — orange-500 CTA button with Play icon (only visible to POC role)
  "Edit POC" — secondary button (only visible to Moderator role)

━━━ TAB NAVIGATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Below sticky header: tab bar, bg-white, border-bottom 0.5px n200
Tabs: Overview | Pipeline (ATS) | Mentors | Sessions | Feedback
Active tab: border-bottom 2px orange-500, text orange-600, font-medium
Inactive: n500, hover n800, transition 150ms
Tab switch: Framer AnimatePresence, opacity + x slide (150ms)

━━━ TAB 1: OVERVIEW ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2-col layout: left (60%) + right (40%), 24px gap

Left card (bg-white, radius 16px, padding 24px):
  H4 "Job Description Summary"
  Parsed fields in a clean grid:
    Company · Role · Domain · Seniority · Industry (each label 11px uppercase n400 + value 14px n800)
  Skills section: Required (orange chips) + Preferred (n100 chips)
  Below: full JD text in collapsible (max-height 120px, fade gradient, "Show more" orange link)

Right stack:
  Card 1 (bg-white): "Candidates" — list of candidate names with current round badge
  Card 2 (bg-white): "Health & Timeline"
    Health: large status badge (sage/yellow/coral) with 8px dot + label
    SLA: "X days open" colored chip
    Created: date
    Last activity: date + action description
  Card 3 (bg-white, AI card style — left border orange-500): "Decision Insights"
    POC assignment rationale text
    Small 5-bar score breakdown: Role · Skills · Company · Industry · Seniority

━━━ TAB 2: ATS PIPELINE (POC only) ━━━━━━━━━━━━━━━━━━━━━━
Full-width kanban board. Horizontal scroll on overflow.

KANBAN LAYOUT:
  Left sticky col: "Candidates" (200px, bg-n100, radius 12px, padding 12px)
    Header: "CANDIDATES" label (11px uppercase n500) + count badge
    Candidate avatar cards: 
      40px avatar (colored initials, consistent color per candidate) + Name (13px bold) + Cohort (11px n400)
      Eye icon: top-right, appears on hover (opacity 0→1 150ms), opens Remarks History drawer

  Round columns: (each 200px min-width, bg-n100, radius 12px, padding 12px)
    Header: round number badge (orange-500 bg, white text, 20px circle) + round name (13px medium n800) + count badge
    Empty state: dashed border 1px n300, "Drop candidate here" (12px n400 centered), height 80px min

  Candidate token in rounds:
    Same 40px circle + name 13px
    Eye icon on hover
    Full card is draggable (@dnd-kit/core)
    
DRAG INTERACTION:
  On drag start: card scales 1.05 (ease-spring 150ms), shadow-xl, opacity 0.9, cursor grabbing
  Drag over valid column: column border flashes orange-500 (150ms)
  
REMARKS POPOVER (on drop — non-dismissable):
  Appears anchored near drop point: bg-white, radius 12px, shadow-xl, width 360px, padding 20px
  Header: "Moving: [Name]  [From Round] → [To Round]" (13px n600)
  Textarea: min-height 100px, required, min 10 chars
  Character counter: "0 / 500" bottom-right, 11px n400
  Progress ring around counter: orange-500 fills as typing
  "Confirm Move →" orange CTA (disabled until 10+ chars) + "✕ Cancel" ghost
  Cannot ESC, cannot click outside — must choose
  Error state if <10 chars on submit attempt: coral border + "Minimum 10 characters required"

REMARKS HISTORY DRAWER:
  Triggered by eye icon. Right drawer, 400px, full-height, bg-white, shadow-xl
  Header: "[Name] — Progress History" + Close × button
  Subheader: "PM @ Zomato · Current Round: R2 — Technical" (13px n500)
  Divider
  
  Timeline: each entry as a comment thread item:
    Avatar (28px) + POC name + timestamp (11px n400 right)
    Type indicator: "R1 → R2" chip (round change) or "Note" chip (standalone)
    Remark text (14px n700, line-height 1.6)
    Divider between entries
  
  Bottom: "Add a note (no round change)" textarea + "Post Note" orange ghost button
  Footer sticky, divider above
  Drawer enter: x:400→0 (350ms ease-enter) | Exit: x:0→400 (220ms ease-exit)

━━━ ROUND CONFIG MODAL (560px) ━━━━━━━━━━━━━━━━━━━━━━━━━━
Triggered by "+ Configure Rounds" button in ATS header
H3 "Configure Interview Rounds"

Sortable list (@dnd-kit sortable):
  Each round row: drag handle (⠿, n400) + round number (R1, R2 etc., orange-500) + type select dropdown + × remove
  Type dropdown options: HR Screening · Technical Round · Case Study · Behavioural · Group Discussion · Assignment · Presentation · Final Round · Offer · Waitlisted · Rejected
  
  Drag reorder: smooth Framer layout animation on item positions
  
"+ Add Another Round" ghost button with Plus icon
"Save Rounds" orange CTA + "Cancel" ghost
Reconfiguration warning (if rounds exist with candidates): 
  yellow banner: "⚠️ 2 candidates may be repositioned. Review after saving."
```

---

## PROMPT 09 — Mentors Tab & Match Results

```
Build the MENTORS TAB inside Requisition Detail.

━━━ EMPTY STATE (before match is run) ━━━━━━━━━━━━━━━━━━━━
Center card (bg-white, radius 16px, padding 48px):
  Illustrated empty: search icon with sparkles (plum gradient)
  H3 "No mentor matches yet"
  Body: "Run the AI matching engine to find the best mentors for this role."
  Source toggles row: [MU teal chip toggle] [ALU sage chip toggle] [EXT sky chip toggle]
  All active by default, click to deactivate (chip dims, opacity 0.4)
  "▶ Find Mentors" — orange-500 CTA button, LG size, full-width max 320px

━━━ AI PROCESSING OVERLAY (Framer AnimatePresence) ━━━━━━
Full overlay on Mentors tab content: bg-white/90, backdrop blur(8px), radius 16px
Centered processing card (480px wide):
  Plum pulsing badge "AI Matching" with animated dot
  H4 "Finding the best mentors..."
  6 animated progress steps (stagger in, 200ms each):
    Each step: checkmark (sage when done, pulsing circle when current, n300 when pending) + label
    1. Loading mentor pool (3 sources)
    2. Normalizing role + skills data
    3. Running 5-layer matching algorithm
    4. Calculating decision tags
    5. Generating match explanations
    6. Ranking results
  Progress bar: orange-500, width animated, ease-linear
  3-dot loader: dots scale 1→1.3→1 stagger 120ms, cycling n400→orange-500→plum-400

━━━ RESULTS LAYOUT (3-column) ━━━━━━━━━━━━━━━━━━━━━━━━━━━
If multiple candidates: tab strip at top (candidate names, active=orange underline)

Left: Filters panel (280px, bg-white, radius 16px, shadow-sm, padding 20px, sticky)
  Source filter: MU/ALU/EXT checkboxes with colored chips
  Score range: dual thumb slider, orange-500 filled track
  Decision tags: multi-select chips (Best HR · Company Insider · etc.)
  Seniority: checkbox group
  "Reset Filters" ghost link orange-500

Center: Mentor cards (flex-col, 16px gap)
  Count: "42 mentors found — showing 20" (13px n500) + Sort dropdown right

Right: Decision Insights panel (280px, bg-orange-50, border orange-200, radius 16px, padding 20px, sticky)
  H5 "Why Top Mentors Differ" (orange-600)
  AI-generated 3–4 sentence comparison paragraph (13px n700, line-height 1.6)
  Insight chips: one per insight point
  "Top pick" indicator pointing to rank 1 card

━━━ MENTOR CARD ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bg-white, radius 16px, shadow-sm, border 0.5px n200, padding 24px
Hover: shadow-md border n300 transition 220ms

Layout:
  Left: 56px avatar (photo or colored initials circle) + source badge below (teal MU / sage ALU / sky EXT)
  Center: 
    Name (16px bold n900) + Role @ Company (14px n500)
    Contact row: email icon + phone icon + WhatsApp circle button (sage-50 bg) + LinkedIn circle button (sky-50 bg)
  Right:
    Score: 52px bold orange-500 + "/100" 13px n400 below, circle container bg-orange-50

  Full-width divider (0.5px n200)

  Decision tags row: emoji + label pills (bg-orange-50, border orange-200, text orange-700, radius 100px, 11px)
  Layer badge: "Layer 1: Same Role + Company" (11px n400 italic)
  
  5-segment score bar (180px): each segment = one scoring dimension
    Colors: Role=orange-500, Skills=teal-400, Company=plum-400, Industry=sky-400, Seniority=sage-400
    Tooltip on hover shows each segment value "Role: 32/35"
  
  Ratings row: ★★★★☆ + "4.2/5 (12 reviews)" + separator + "Outcome: 78% Goal Met" (13px sage-400)
  Availability: "Available ✓" sage tag OR "Busy" coral tag

  Action row (3 buttons):
    "View Full Profile" ghost button
    "Shortlist ★" secondary button (fills star and bg-yellow-50 when active)
    "Select as Mentor →" orange-500 CTA

━━━ FULL MENTOR PROFILE (right drawer, 720px) ━━━━━━━━━━━
Triggered by "View Full Profile". Full-height right panel.
8-tab navigation: Overview · Experience · Match Analysis · Decision Insights · Remunerations · Feedback & Ratings · LMP History · Interaction Log

Each tab content in scrollable area below tabs header.
Match Analysis tab shows the 5-dim score table and skill overlap comparison (matched ✓ / missing ✗)
Decision Insights tab: round-fit tags, Company Insider flag, claude-generated rationale
Ratings tab: all past reviews as comment cards, aggregated star + outcome pie (Recharts)

Panel enter: x:720→0 (450ms ease-enter) · Backdrop: rgba(26,25,22,0.4) blur(4px)
```

---

## PROMPT 10 — Sessions Tab & Feedback Tab

```
Build the SESSIONS TAB and FEEDBACK TAB inside Requisition Detail.

━━━━ SESSIONS TAB ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tab header: "Sessions" + count badge + "Schedule Session +" orange CTA right (only if mentor selected)

Session cards (list, 12px gap):
  Card: bg-white, radius 12px, shadow-sm, border 0.5px n200, padding 20px
  
  Status badge (top-right): 
    Scheduled: teal-50 bg teal text
    Completed: sage-50 bg sage text
    No-show: coral-50 bg coral text  
    Rescheduled: yellow-50 bg yellow text
    Feedback Pending: orange-50 bg orange text (pulsing dot next to it)
    Closed: n100 bg n500 text

  Session info:
    Mentor avatar (32px) + "Rahul Verma" bold + role @company (n500, 13px)
    Separator dot · Candidate avatar (28px) + name
    Date/time row: Calendar icon + "May 2, 2026 · 3:00 PM" (14px n700)
    Round context: "Round: R2 — Technical" chip

  Action buttons row (context-aware by status):
    Scheduled: "Mark Complete" (sage CTA) + "Mark No-show" (coral ghost) + "Reschedule" (secondary) + "Cancel" (danger)
    Completed: "Fill Feedback →" orange CTA (pulsing if not submitted)
    Feedback Pending: "Send Reminder" secondary + feedback status (POC ✓ · Student pending ⏳)
    Closed: "View Summary" ghost

RESCHEDULE MODAL (400px):
  H4 "Reschedule Session"
  Date picker (calendar popover, orange-500 selected date)
  Time input
  Optional note textarea
  "Confirm Reschedule" orange CTA + "Cancel" ghost

MARK COMPLETE → POC FEEDBACK MODAL (560px):
  H3 "Session Feedback"
  Subhead: "Rate this session to generate the student link"
  
  10 fields in a card:
    Star rating fields (4 fields): 5 stars each, hover orange fill, transition 150ms
      Overall Mentor Rating · Session Quality · Mentor Responsiveness · Relevance to Goals
    Would Recommend: toggle (18×28px pill, orange when yes)
    Mentor Strengths: textarea, min 50 chars, counter
    Areas for Improvement: textarea (optional)
    Session Notes / Summary: textarea, min 100 chars, counter, required
    Session Outcome: select dropdown (Goal Met / Partial / Not Met)
    Confirm Complete: checkbox — "I confirm this session is complete"
  
  Progress: "7 of 10 fields complete" bar (orange-500)
  "Submit Feedback & Generate Student Link" orange CTA (full-width) — disabled until all required fields met
  "Cancel" ghost below

POST-SUBMISSION STATE (replaces modal content):
  Sage success animation (checkmark scales in with ease-spring)
  "Student feedback link generated!"
  Token URL in a code-style box (monospace, bg-n100, rounded, copy button right)
  "Copy Link" orange CTA + "Send via WhatsApp" sage button + "Send via Email" secondary
  "This link expires in 30 days" (12px n400)

━━━━ FEEDBACK TAB ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
H4 "Feedback Tracker"
Summary strip: 3 stat pills — Total sessions · POC submitted · Student submitted

Table: Session | Mentor | Candidate | Date | POC Feedback | Student Feedback | Status
POC Feedback cell: ✓ submitted (sage) / ⏳ pending (yellow, with "Fill Now →" inline orange link)
Student Feedback cell: ✓ done (sage) / ⏳ waiting (n400) / "Token expired - Regenerate" (coral link)
Status: "Closed" (sage) / "Pending" (yellow pulse dot)

Regenerate token modal (400px): "Are you sure? This resets the 30-day timer. Old link is invalidated."
One-time only — after regeneration, button disabled + "Regenerated once — cannot generate again" (n400)

━━━━ PUBLIC STUDENT FEEDBACK PAGE (/feedback/:token) ━━━━
Standalone page (no sidebar/nav — public, no auth)
Mobile-first layout, max-width 480px centered

Top: "MentorMatch" wordmark (n900) + orange dot
Session summary: "Your session with [Mentor Name]" (H3) + date chip

7 fields (large touch targets, 44px min):
  Star ratings: 48px stars for easy mobile tap
  Yes/No/Maybe: large pill buttons (full-width options)
  Textarea: min-height 80px
  
Progress indicator: step dots at top, orange-500 fill
"Submit Feedback" orange CTA (full-width, LG)
"Your feedback helps other students find the right mentor" (13px n400, center)

Success screen: sage-400 checkmark (animated scale-in ease-spring) + "Thank you!" H2 + "Your feedback has been submitted." + close button
Token expired screen: coral info card + "This link has expired. Contact your career services team."
```

---

## PROMPT 11 — POC Dashboard

```
Switch role context to 'poc'.
Build the POC DASHBOARD at /dashboard.

━━━ PAGE HEADER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
H2 "My Dashboard" (n900)
Subtitle: "Here's what needs your attention today" (n500, 14px)
Note: No "Create Requisition" button — POC cannot create

━━━ KPI ROW (4 cards, equal width) ━━━━━━━━━━━━━━━━━━━━━━━
Card 1 — SPAN 2 "My Assigned Reqs"
  Large number 7 (48px orange-500)
  Breakdown: 3 Ongoing · 2 Pending Match · 1 Dormant · 1 Hold (each colored by status)
  Sparkline trend

Card 2: Candidates in Pipeline
  24, last 30 days +8, teal accent

Card 3: Sessions This Month  
  8 total · 3 upcoming (calendar icon)

Card 4: Pending Feedback
  Coral badge if >0: "3 sessions awaiting feedback"
  "Submit Now →" orange link inside card

━━━ ROUND ACTIVITY CHART ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Full-width card, bg-white, radius 16px, padding 24px
H4 "Candidates by Round Stage" (across all my reqs)
Recharts grouped bar or horizontal stacked bar:
  Y-axis: Round names (R1 HR / R2 Technical / etc.)
  X-axis: candidate count
  Color: orange-500 fill, n200 track
  Tooltip: req name + count

━━━ SMART NUDGES (POC-specific) ━━━━━━━━━━━━━━━━━━━━━━━━━
Same horizontal scroll nudge card row as Moderator dashboard, POC-specific copy:
- "PM @ Swiggy — mentor match not run yet. Run now →"  
- "3 sessions are awaiting your feedback"
- "Priya Sharma stuck in R2 for 10 days — check in"
- "PM @ Zomato has no activity in 9 days"

━━━ MY REQUISITIONS (compact card list) ━━━━━━━━━━━━━━━━━━
H4 "My Requisitions" + "View All →" orange link
List of 5 most recent assigned reqs as compact row cards:
  Each: Role @ Company (14px bold) · Stage chip · SLA chip · 3 action buttons: Pipeline | Match | Sessions
  
━━━ SLA ALERTS + QUICK ACTIONS (2-col, 24px gap) ━━━━━━━━
Left (60%): "SLA Alerts" — same as Moderator but shows only MY reqs
  Each row: req name + days stale + "Update Pipeline" orange ghost CTA

Right (40%): Quick Links card
  List of shortcut buttons:
    "Go to my reqs" · "Pending sessions" · "Submit feedback" · "Run mentor match"
  Each: ghost button with icon, full-width, left-aligned, 48px height
  Hover: bg-n50, border-left 3px orange-500 (150ms transition)
```

---

## PROMPT 12 — POC Requisition Board

```
Build the POC REQUISITION BOARD at /requisitions (POC view).
Differences from Moderator board:
- Shows ONLY assigned reqs (scoped)
- No "Edit POC" button on cards
- Cards show POC role as "You (Primary)" or "You (Secondary)"
- Extra quick actions: Expand Pipeline inline + Run Mentor Match

━━━ CARD ADDITIONS (POC-only) ━━━━━━━━━━━━━━━━━━━━━━━━━━━
Below the standard actions row, add:
  [↓ Expand Pipeline] — ghost button with ChevronDown icon
  
EXPANDED PIPELINE PANEL (inline, Framer height animation 350ms ease-enter):
  Horizontal mini-kanban row inside the card:
    Each round = small column (equal width)
    Candidate dots: 20px circles in each round column (colored, count shown)
    Round name in 10px caption
    "Full ATS →" orange link at end
  
  On card body: show mini health bar + "Stage: [Current Round]"

Card actions row: [View Details →] [+ Configure Rounds] [▶ Run Mentor Match]
Run Mentor Match button: orange-500, triggers match flow on click

━━━ INLINE PIPELINE EXPAND INTERACTION ━━━━━━━━━━━━━━━━━
Chevron rotates 0→180° on expand (150ms ease-spring)
Height animates open (350ms ease-enter)
Candidates dots use Framer stagger: scale 0→1, 60ms delay each
```

---

## PROMPT 13 — Last Mile Prep (LMP) Board

```
Build the LMP BOARD at /lmp. All roles can view. Moderator/Admin can edit.

━━━ PAGE HEADER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
H2 "Last Mile Prep" (n900)
Subtitle: "Requisition-level placement tracking across all stages" (n500)
Right: "Log Process +" orange CTA button (Moderator/Admin only — hidden for POC)
Right also: Kanban/Table toggle (2-button segmented control, active = orange-500 bg white text)

━━━ KPI STAT CARDS (6 cards, matching 6 statuses) ━━━━━━━━
Horizontal row, equal width, 12px gap, height 72px each
Each: colored left border 4px + icon + count (24px bold) + status label (12px uppercase n500)
Ongoing: teal border, Activity icon
Dormant: yellow border, Moon icon
Hold: n400 border, PauseCircle icon
Converted: orange-500 border, Target icon
Not Converted: coral border, XCircle icon
Closed: n600 border, Archive icon

━━━ FILTER BAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bg-white, radius 12px, padding 16px 20px, shadow-sm, margin-bottom 20px
Search: left icon, "Search role, company, POC..." placeholder
Dropdowns: All Companies · All Roles · All POCs · All Statuses
Each dropdown: 36px height, n300 border, 13px, chevron right
Active: orange-50 bg, orange-400 border

━━━ KANBAN VIEW ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6 columns (equal width, scroll horizontally if needed, min-width 220px each)
Column header: colored dot (8px, matching status) + status name (12px uppercase n600) + count badge (n100 bg, n600 text, 11px)
Column body: bg-n100, radius 12px, padding 8px, min-height 300px

LMP CARD (in columns):
  bg-white, radius 12px, shadow-sm, border 0.5px n200, padding 16px, margin-bottom 8px
  Hover: shadow-md, border n300, cursor grab
  
  Line 1: "Product Manager @ Swiggy" (14px bold n900)
  Line 2: "3 Candidates · Product Management" (12px n500)
  Line 3: "Stage: R2 — Technical" chip (bg-n100 text-n600, 11px)
  
  Divider 0.5px n200
  
  POC row: up to 3 avatar circles (24px, colored initials, -4px overlap) + "+N more" if overflow
  
  Stats row:
    Health dot (8px) + label (12px): Healthy=sage · Slow=yellow · Stuck=coral
    Separator · SLA chip: "<14 days" sage-50 · "14-30 days" yellow-50 · ">30 days" coral-50
    Calendar icon + creation date (11px n400)
  
  Last activity: "Apr 24 — Round updated" (11px n500 italic, bottom)
  
  "View details →" orange-500 13px link (bottom right)
  
  If Hold/Closed: reason text in 11px coral-50 bg rounded chip below stats

DRAG TO COLUMN (Moderator/Admin only):
  On drag: card lifts (scale 1.03, shadow-xl, ease-spring 150ms), column highlights target
  On drop: status change confirmation modal (400px)
    "Change status to [New Status]?" + optional reason textarea + Confirm orange / Cancel ghost

━━━ TABLE VIEW ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TanStack Table — sortable columns
Columns: Role @ Company | Domain | POC(s) | # Candidates | Current Stage | Status pill | Health | SLA | Last Activity | View →
Row height: 52px. Alternating: odd bg-n50. Hover: bg-orange-50.
Status pill: per status color (see global rules)
POC avatars: stacked circles, same as kanban card
SLA: colored chip (sage/yellow/coral thresholds)
Health: 8px dot + text
Sticky header. Virtualized rows for long lists.
```

---

## PROMPT 14 — LMP Detail Page

```
Build the LMP DETAIL PAGE at /lmp/:id.

━━━ PAGE LAYOUT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3-column: left timeline (flex-1) + right sidebar (360px)
Back link: "← Last Mile Prep" at top-left (13px n500, orange-500 arrow)

━━━ PAGE HEADER CARD ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bg-white, radius 16px, shadow-sm, padding 24px, margin-bottom 24px, full-width
Left:
  H2 "Product Manager @ Swiggy" (n900)
  "Domain: Product Management · Seniority: Mid-Senior" (n500, 14px)
  POC avatars row (32px circles, orange ring on primary, purple ring on secondary) + names
  Metadata: "3 Candidates · Stage: R2 — Technical · Created Apr 23, 2026"
Right:
  Status dropdown (Moderator/Admin): styled select showing current status pill, clicking opens status options
  Health badge (large, 12px dot + label)
  SLA chip ("8 days open", colored)
  "Last updated: Apr 24" (12px n400)

━━━ PROGRESS TIMELINE (left main area) ━━━━━━━━━━━━━━━━━━
Card: bg-white, radius 16px, shadow-sm, padding 24px
H4 "Progress Timeline" (n800)

Vertical timeline (left border 2px n200, events on right):
  Each event: 
    Dot on timeline: 10px circle (orange-500 for system events, n400 for notes)
    Date: 11px n400 (compact format)
    Event text: 13px n700
    Author: 11px n500 italic if human action
    
  Event types (each slightly different style):
    Req created: orange-500 dot + "Req created · JD Mode 1 upload"
    POC assigned: orange dot + "POC Priya Sharma assigned (AI score: 87). Confirmed by Ravi."
    CV upload: n600 dot + "5 CVs uploaded by Moderator Ravi Kumar"  
    Rounds config: n600 dot + "Rounds configured: R1 HR · R2 Technical · R3 Case Study"
    Round move: teal dot + "Priya moved R1 → R2. Note: 'Cleared HR round.'" 
    Match run: plum dot + "Mentor match run. 42 results. Top: Rahul Verma (87/100)"
    Status change: yellow dot + "Status changed to Dormant (SLA: 14 days inactive)"
  
  Framer stagger entrance: each event y:8→0 opacity 0→1, 40ms delay increments

━━━ REMARKS THREAD (below timeline in same main column) ━━
H4 "Remarks" (n800) + "Shared between all POCs, Moderator, and Admin" (12px n400)
Comment thread design:
  Each remark: avatar (32px) + name + timestamp (right) + remark text
  Role badge below name: Moderator=orange, POC=teal, Admin=plum (11px, pill)
  Replies indented 20px if any

"+ Add Remark" area at bottom:
  Textarea (placeholder "Add a remark visible to all assigned roles...") + "Post" orange button
  Only visible to Moderator/Admin/POC assigned to this req

━━━ RIGHT SIDEBAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sticky top. Stack of cards (16px gap):

Card 1: Candidates (bg-white, radius 12px, padding 16px)
  H5 "Candidates" + count badge
  List: avatar + name + current round chip, 3 max then "+ N more" link

Card 2: Mentor Sessions (bg-white, radius 12px, padding 16px)
  H5 "Sessions" + count
  Each: mentor name + candidate + status chip (teal/sage/coral per state)

Card 3: Log Process (bg-white, radius 12px, padding 16px) — Moderator/Admin only
  H5 "Log Status Change"
  Current status shown
  "Change Status →" orange CTA button
  Opens inline form (Framer height expand 350ms):
    New status select + required reason textarea + Confirm / Cancel
    Note: "This will update the LMP status and log the change."

Card 4: Health & SLA (bg-white, radius 12px, padding 16px)
  Health visual (large status badge)
  SLA meter: horizontal bar, orange-500 fill, thresholds marked at 14d and 30d
  Last activity date
  "Days open: 8" large number n900

━━━ MOTION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Timeline events stagger in on load
Status change inline form: height 0→auto ease-enter 350ms
Remark post: new item slides in from bottom (y:20→0, opacity 0→1, ease-spring 220ms)
```

---

## PROMPT 15 — Polish, Micro-interactions & Edge Cases

```
Final polish pass across all views. Apply to the entire app.

━━━ LOADING STATES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Skeleton loaders for all cards and tables:
  Use Tailwind animate-pulse on placeholder rectangles
  Match exact layout of loaded state (same heights, same column widths)
  Skeleton bg: n200, shimmer gradient: n200 → n100 → n200 (linear sweep, 1.5s loop)

Page transition: opacity fade 0→1 (220ms) on route change (Framer AnimatePresence)

━━━ EMPTY STATES (each unique) ━━━━━━━━━━━━━━━━━━━━━━━━━━
Requisitions board empty: FileText icon 64px n300 + "No requisitions yet" + CTA
LMP kanban empty column: "No reqs in this stage" 12px n400, dashed border column
Mentors tab empty: illustrated search icon + "Run mentor match to see results"
Sessions tab empty: Calendar icon + "No sessions scheduled yet"
Feedback tab empty: MessageSquare icon + "Feedback will appear once sessions are completed"
Remarks empty: "No remarks yet" italic n400

Each empty state: icon (n300), H4 (n800), body (n500), optional CTA

━━━ TOAST NOTIFICATIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Top-right corner, stack up to 3
Width: 360px. Radius: 12px. Shadow-lg. Padding: 16px.
Enter: x:20→0 opacity 0→1 (220ms ease-enter) · Exit: x:0→20 opacity 1→0 (150ms ease-exit)

Types:
  Success: sage left border 3px + CheckCircle icon sage-400
  Error: coral left border + AlertCircle icon coral-400
  Warning: yellow left border + AlertTriangle icon yellow-500
  Info: sky left border + Info icon sky-400
  AI: orange left border + Zap icon plum-400 (for AI completions)

Auto-dismiss: 4 seconds. Manual close × button.
Action button optional: "Undo" ghost orange link inline

━━━ CONFIRMATION DIALOGS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use for: deactivate user, delete round, close req, change LMP status
400px modal, center, shadow-xl, radius 16px
Backdrop: blur(20px) rgba(26,25,22,0.6)
Icon (top, 48px circle): coral bg for destructive / yellow bg for warning
H4 title (n900)
Body text (n600, 14px)
Buttons: right-aligned, "Cancel" ghost + action button (danger or orange-500)
Enter: scale 0.95→1 (350ms ease-enter)

━━━ RESPONSIVE BEHAVIOR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sidebar collapses to icon-only (48px) below 1280px
Below 768px: sidebar becomes bottom sheet drawer
Bento KPI grids: 4-col → 2-col → 1-col at breakpoints
Card grid: 3-col → 2-col → 1-col
Kanban: horizontally scrollable at all sizes
Modals: full-screen on mobile (<640px)

━━━ ACCESSIBILITY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
All interactive elements: visible focus rings (orange 3px)
All icons: aria-label or title text
Status indicators: always icon + text (never color alone)
Tables: proper thead/tr/td with aria-sort on sortable columns
Modals: focus trap, escape-to-close (except Remarks popover which is non-dismissable)
Drag-and-drop: keyboard alternative via select + enter to move candidate

━━━ PREFERS-REDUCED-MOTION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Wrap all Framer animations in:
  @media (prefers-reduced-motion: reduce) → duration 30ms, no transform, opacity-only

━━━ FINAL DESIGN CHECKS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ orange-500 appears exactly once per view as primary action
□ Fraunces italic used max 2× per page, never in data
□ Page background is n50 (#FAFAF8) everywhere — never pure white
□ All status indicators pair icon + text (not color alone)
□ Heading hierarchy sequential (H1→H2→H3, no skipping)
□ Min 12px text in dashboards
□ Focus rings visible on all interactive elements
□ Sidebar hides (not greys) role-inappropriate items
□ Timestamps use relative format (e.g., "3 days ago") in cards, absolute in detail pages
□ All numbers in bento KPIs use n900 color (not orange) except for primary orange metric
```

---

## QUICK REFERENCE: Role-to-Prompt Map

| Role | Prompts to run |
|------|---------------|
| Admin | Pre-flight → 01 → 02 → 03 → 04 |
| Moderator | Pre-flight → 01 → 05 → 06 → 07 → 08 → 13 → 14 |
| POC | Pre-flight → 01 → 08 → 09 → 10 → 11 → 12 → 13 → 14 |
| Full build | Pre-flight → 01–15 in order |

---

## KEY COMPONENT QUICK-CHEAT

| Component | Key Token |
|-----------|-----------|
| Page background | `#FAFAF8` (n50) |
| Sidebar bg | `#1A1916` (n900) |
| Active nav | `#F7D344` bg + orange left border |
| Primary CTA | `#E38330` (orange-500) — 1 per view |
| Cards | `bg-white`, `border n200 0.5px`, `radius 16px` |
| Status: Ongoing | teal-400 |
| Status: Converted | sage-400 |
| Status: Stuck/Error | coral-400 |
| AI badge | plum-400 |
| Score number | 52px bold orange-500 |
| Health: Healthy | sage-400 dot |
| Health: Slow | yellow-400 dot |
| Health: Stuck | coral-400 dot |
