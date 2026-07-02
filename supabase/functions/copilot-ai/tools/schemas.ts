export const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "rag_search",
      description: "Semantic vector search across all embedded database records using natural language. Use when (1) user asks for 'similar' processes/students/mentors, (2) looking for precedents or past examples, (3) the query is descriptive rather than exact (e.g. 'finance roles needing strong modeling'), (4) recalling past copilot conversations, (5) you cannot locate records via exact SQL filters. Returns top matches ranked by semantic similarity. Prefer SQL tools when the user gives exact field values.",
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", description: "Natural language description of what to find. Be specific and descriptive." },
          tables: {
            type: "array",
            items: { type: "string" },
            description: "Optional table filter. One or more of: lmp_processes, students, poc_profiles, mentors, alumni_records, lmp_daily_logs, copilot_messages. Omit to search all.",
          },
          limit: { type: "integer", description: "Max results to return. Default 6, max 12.", default: 6 },
          threshold: { type: "number", description: "Cosine similarity threshold 0–1. Default 0.68. Lower = more results but less relevant.", default: 0.68 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_lmp_records",
      description: "Search and filter LMP processes by company, role, domain, status, POC name, type, OR recency of updates. Returns matching records with all fields including 'Last Updated' (ISO timestamp). Use updated_within_days=7 for queries like 'processes updated in the last 7 days', or updated_since='2026-05-18' for an explicit cutoff. ALWAYS call this tool — never describe what you're going to search; just call it.",
      parameters: {
        type: "object",
        properties: {
          company: { type: "string", description: "Filter by company name (partial match)" },
          role: { type: "string", description: "Filter by role title (partial match)" },
          domain: { type: "string", description: "Filter by domain (e.g. Finance, PM, Data, Marketing, Sales, Consulting, FOCOS, HR, Supply Chain)" },
          status: { type: "string", description: "Filter by status: Ongoing, Dormant, On Hold, Converted, Not Converted, Offer Received, Closed" },
          mentor_aligned: { type: "boolean", description: "Filter by whether a mentor is aligned. Use false for ongoing processes missing mentor alignment." },
          poc: { type: "string", description: "Filter by POC name (Prep POC or Outreach POC, partial match)" },
          type: { type: "string", description: "Filter by type: Full Time, Internship, Live Project, Case Competition" },
          updated_within_days: { type: "number", description: "Only include records whose Last Updated timestamp is within the last N days (e.g. 7 for 'last week', 1 for 'today', 30 for 'last month')." },
          updated_since: { type: "string", description: "ISO date/timestamp — only include records updated on or after this moment. Overrides updated_within_days if both provided." },
          sort: { type: "string", enum: ["recent", "oldest_activity"], description: "Sort by Last Updated. 'recent' = most recently updated first; 'oldest_activity' = stalest first." },
          limit: { type: "number", description: "Max records to return (default 200, use a higher number or 0 to get all)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_student_profile",
      description: "Look up a student from the Mastersheet by name or roll number. Returns their scores (mock, resume, practicum, behavioral, composite), domains, mentors, placement status, risk flags, and all available data.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Student name (partial match)" },
          roll_no: { type: "string", description: "Roll number" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_students",
      description: "Search the Mastersheet for students matching criteria. Use to find students by domain, placement status, score ranges, mentor, or risk flag.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Student name (partial match)" },
          domain: { type: "string", description: "Primary or secondary domain" },
          placement_status: { type: "string", description: "Final placement status filter" },
          mentor: { type: "string", description: "Mentor name (partial match)" },
          risk_flag: { type: "string", description: "Interview risk flag value" },
          min_composite: { type: "number", description: "Minimum composite (primary) score" },
          limit: { type: "number", description: "Max results (default 100, use a higher number or 0 to get all)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_sessions",
      description: "Search the sessions table — mentor/POC sessions logged against an LMP. Filter by lmp_id, mentor name, attendee/student, status (scheduled/completed/cancelled/no_show), or date range. Returns sessions with scheduled_at, duration, notes, and outcome.",
      parameters: {
        type: "object",
        properties: {
          lmp_id: { type: "string", description: "LMP process UUID to scope sessions to one process" },
          mentor: { type: "string", description: "Mentor name (partial match)" },
          attendee: { type: "string", description: "Student/attendee name (partial match)" },
          status: { type: "string", enum: ["scheduled", "completed", "cancelled", "no_show"], description: "Session status" },
          since: { type: "string", description: "ISO date — only sessions scheduled on/after this date" },
          until: { type: "string", description: "ISO date — only sessions scheduled on/before this date" },
          limit: { type: "number", description: "Max sessions to return (default 50)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lmp_status",
      description: "Update the status of an LMP process. Identifies the record by company+role. Valid statuses: Ongoing, Dormant, On Hold, Converted, Not Converted, Offer Received, Closed.",
      parameters: {
        type: "object",
        properties: {
          company: { type: "string", description: "Company name (exact match)" },
          role: { type: "string", description: "Role title (exact match)" },
          status: { type: "string", enum: ["Ongoing", "Dormant", "On Hold", "Converted", "Not Converted", "Offer Received", "Closed"], description: "New status" },
        },
        required: ["company", "role", "status"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lmp_field",
      description: "Update any field(s) on an LMP process record. Use for prep progress, stage, type, closing date, prep doc, daily progress, R1/R2/R3 shortlisted, final convert, convert names, etc.",
      parameters: {
        type: "object",
        properties: {
          company: { type: "string", description: "Company name to identify the record" },
          role: { type: "string", description: "Role title to identify the record" },
          fields: {
            type: "object",
            description: "Key-value pairs of fields to update. Keys should match sheet column names like: Status, Type, Domain, Prep Progress, Placement Progress, Prep Doc, Daily Progress, R1 Shortlisted, R2 Shortlisted, R3 Shortlisted, Final Convert, Convert Name(s), Closing Date",
            additionalProperties: { type: "string" },
          },
        },
        required: ["company", "role", "fields"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assign_poc",
      description: "Assign or reassign a POC (Point of Contact) to an LMP process. Supports Primary POC (domain prep), Secondary POC (behavioral prep), and Outreach POC (placement coordinator).",
      parameters: {
        type: "object",
        properties: {
          company: { type: "string", description: "Company name" },
          role: { type: "string", description: "Role title" },
          poc_name: { type: "string", description: "Name of the POC to assign" },
          poc_type: { type: "string", enum: ["primary", "secondary", "outreach"], description: "Whether this is a Primary POC (domain prep), Secondary POC (behavioral prep), or Outreach POC assignment" },
        },
        required: ["company", "role", "poc_name", "poc_type"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_lmp_record",
      description: "Create a new LMP process record in the tracker. Requires at minimum company and role.",
      parameters: {
        type: "object",
        properties: {
          company: { type: "string" },
          role: { type: "string" },
          domain: { type: "string" },
          type: { type: "string", description: "Full Time, Internship, Live Project, or Case Competition" },
          status: { type: "string", description: "Initial status (default: Ongoing)" },
          prep_poc: { type: "string", description: "Prep POC name" },
          outreach_poc: { type: "string", description: "Outreach POC name" },
        },
        required: ["company", "role"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_lmp_record",
      description: "Soft-delete an LMP process record (marks it as deleted, doesn't remove from sheet).",
      parameters: {
        type: "object",
        properties: {
          company: { type: "string", description: "Company name" },
          role: { type: "string", description: "Role title" },
        },
        required: ["company", "role"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bulk_update",
      description: "Update multiple LMP records at once. Provide a list of updates, each with company+role identifier and the fields to change. Use for batch status changes, bulk POC reassignment, etc.",
      parameters: {
        type: "object",
        properties: {
          updates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                company: { type: "string" },
                role: { type: "string" },
                fields: { type: "object", additionalProperties: { type: "string" } },
              },
              required: ["company", "role", "fields"],
            },
            description: "List of records to update with their new field values",
          },
        },
        required: ["updates"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_analytics",
      description: "Compute analytics from the LMP data. Returns counts, breakdowns, conversion rates, POC workload, domain distribution, status distribution, age tracking, and other aggregated metrics.",
      parameters: {
        type: "object",
        properties: {
          metric: {
            type: "string",
            enum: [
              "status_distribution", "domain_distribution", "poc_workload",
              "conversion_rate", "type_distribution", "age_tracking",
              "overview", "pipeline_summary",
            ],
            description: "Which metric to compute",
          },
          domain: { type: "string", description: "Optional domain filter" },
          poc: { type: "string", description: "Optional POC filter" },
        },
        required: ["metric"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "smart_search",
      description:
        "Semantic retrieval-augmented search across LMP processes and the student database. Takes a free-text query, expands it into semantically related keywords using AI, then searches across ALL fields of every LMP record and every student row. Returns the most relevant rows ranked by combined keyword + semantic similarity score. Each result includes the source ('lmp' or 'students'), the matched columns, and the full record. Use this when the user's question doesn't map neatly to structured filters, or when you need to find rows matching a natural-language phrase across multiple fields. After calling smart_search, ALWAYS present the top results in a table block with sortable columns.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Free-text search query (e.g. 'finance internship with Radhika that got converted')",
          },
          sources: {
            type: "array",
            items: { type: "string", enum: ["lmp", "students"] },
            description:
              "Which datasets to search. Defaults to ['lmp', 'students'].",
          },
          limit: {
            type: "number",
            description: "Max results to return (default 15)",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recommend_pocs",
      description: "Run the AI-powered POC allocation engine to recommend the best Primary, Secondary, and Outreach POCs for an LMP process. Returns scored recommendations with breakdowns.",
      parameters: {
        type: "object",
        properties: {
          company: { type: "string", description: "Company name" },
          role: { type: "string", description: "Role title" },
          domain: { type: "string", description: "Process domain (e.g. Finance, PM, Data, Engineering)" },
        },
        required: ["company", "role", "domain"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_activity",
      description: "Log an operational action to the activity audit trail. Call this after every write operation (status update, POC assignment, bulk update, etc.).",
      parameters: {
        type: "object",
        properties: {
          actor_name: { type: "string", description: "Who performed the action" },
          poc_role_type: { type: "string", enum: ["primary", "secondary", "outreach", "system", "admin"], description: "Role type of the actor" },
          entity_type: { type: "string", description: "Type of entity affected (lmp, student, poc)" },
          entity_id: { type: "string", description: "Identifier of the entity" },
          action: { type: "string", description: "What was done" },
          previous_value: { type: "string", description: "Value before change" },
          new_value: { type: "string", description: "Value after change" },
        },
        required: ["actor_name", "action", "entity_type"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_lmp_context",
      description: "Before running mentor matching for an LMP process, verify whether a Job Description (JD) or sufficient skill context is attached. Use this whenever the user asks to find/match/recommend mentors for a specific LMP. Optionally pass `use_last_jd: true` (with company) to reuse the JD/prep_doc from the most recent process for that company. Returns { hasJd, jdSummary, missingFields, lmp }.",
      parameters: {
        type: "object",
        properties: {
          lmp_id: { type: "string", description: "UUID of the LMP process to check" },
          company: { type: "string", description: "Company name (used when lmp_id is unknown, or with use_last_jd)" },
          role: { type: "string", description: "Role title (helps narrow down when company has multiple processes)" },
          use_last_jd: { type: "boolean", description: "If true, reuse the most recent prior LMP process's JD/prep_doc for the same company" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_entities",
      description: "List ALL entities of a given type from the database. Use this when the user asks to 'show all POCs', 'list all mentors', 'how many students', 'show all alumni', or any similar enumeration query. Do NOT use resolve_entity for these — resolve_entity is for name lookup only and is capped at 6–20 results. list_entities returns the complete set with no artificial limit. Supported types: poc, student, mentor, alumni.",
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            enum: ["poc", "student", "mentor", "alumni"],
            description: "Which entity type to list",
          },
          domain: { type: "string", description: "Optional domain filter" },
          limit: { type: "number", description: "Max rows to return (default 200, use 0 for all)" },
        },
        required: ["entity_type"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resolve_entity",
      description: "Resolve an ambiguous name (e.g. 'Sonali', 'Google PM', 'Radhika') to a concrete entity in the platform. Always call this FIRST when the user mentions a person, company, or LMP process by name and you need to act on or describe it. Returns { resolution_status: 'single_match' | 'multiple_matches' | 'no_match', selected_entity?, matches[], reasoning }. Use preferred_scope to bias the search when the user has selected a scope (student, poc, mentor, alumni, lmp, company, domain).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The name or phrase to resolve" },
          preferred_scope: {
            type: "string",
            enum: ["global", "student", "poc", "mentor", "alumni", "lmp", "company", "domain", "status"],
            description: "Bias the resolver toward this entity type. Use 'global' (or omit) when the user has not chosen a scope.",
          },
          limit: { type: "number", description: "Max matches to return (default 6)" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_permission",
      description: "Check whether the CURRENT user (their role is server-side) is allowed to perform a given write action BEFORE you call any state-changing tool or render a confirmation-card. If allowed=false, you MUST emit a `permission-denied-card` block (using the returned reason + safe_alternative) and STOP — do NOT attempt the action. Read-only flows do not need this check.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: [
              "create_lmp", "edit_lmp", "delete_lmp",
              "assign_poc", "reassign_poc",
              "change_status", "change_domain",
              "edit_remarks", "edit_daily_progress",
              "upload_jd", "assign_mentor", "bulk_update",
            ],
            description: "The write action you are about to perform.",
          },
          target_summary: {
            type: "string",
            description: "Short human description of the target (e.g. 'LMP Google · PM Intern'). Optional, included in the denial card.",
          },
        },
        required: ["action"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_write",
      description: "MANDATORY second step (after `check_permission` allowed=true) before EVERY write. Stages the pending change server-side, snapshots current values, validates RBAC, and returns a `pending_action_id` (TTL 10 minutes). You MUST render a `confirmation-card` block with the returned `pending_action_id`, `current`, `proposed`, and `sync_impact`. Do NOT call the underlying write tool directly — only `execute_pending` with that id (after user confirms) may mutate state.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["update_lmp_status","update_lmp_field","assign_poc","add_lmp_record","delete_lmp_record","bulk_update"],
            description: "Which underlying write action this prepares.",
          },
          payload: {
            type: "object",
            description: "Arguments for the underlying write tool. Stored server-side; not round-tripped by the client.",
            additionalProperties: true,
          },
          target_summary: { type: "string", description: "Short label for the target (e.g. 'Google · PM Intern')." },
          sync_impact: { type: "string", description: "One-line description of side-effects (sheets, activity log, downstream)." },
        },
        required: ["kind", "payload"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_pending",
      description: "Execute a previously prepared write action AFTER the user confirms. Loads the staged row server-side by `pending_action_id` only (kind/payload are NOT accepted from the client — they are read from the server-staged row). Re-validates RBAC, marks the row executed atomically, and writes an activity-log row.",
      parameters: {
        type: "object",
        properties: {
          pending_action_id: { type: "string", description: "UUID returned by prepare_write." },
        },
        required: ["pending_action_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "parse_jd",
      description: "Parse a Job Description (raw text or URL) into structured data (role, company, domain, seniority, required/preferred skills, responsibilities, qualifications, summary, confidence). Use this whenever the user pastes a JD, shares a JD link, or asks to 'add this JD' / 'extract from this JD' / 'use this JD for matching'. AFTER calling, render a `jd-summary-card` block with the parsed data so the user can confirm. If the user wants to find mentors, set `next_action_label: \"Find mentors for this JD\"` and `next_action_command: \"Find mentors for <Company> · <Role> using parsed JD\"`. Read-only; does NOT need check_permission.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Raw JD text (preferred when available)." },
          url: { type: "string", description: "URL to fetch JD content from (used if text is empty)." },
          company: { type: "string", description: "Company hint (helps the parser when text is sparse)." },
          role: { type: "string", description: "Role hint (helps the parser when text is sparse)." },
          domain: { type: "string", description: "Domain hint (e.g. 'Product', 'Data', 'Marketing')." },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_mentors_for_jd",
      description: "Find and rank mentors that fit a given JD / role context. Use this AFTER `check_lmp_context` returns hasJd=true OR after `parse_jd` returns parsed JD data. Returns a ranked shortlist (top N) with score breakdown. After calling, render a `mentor-shortlist-card` block. If the user then clicks Assign on a row, follow the standard `check_permission → prepare_write (kind=assign_mentor or appropriate) → execute_pending` flow. Read-only; does NOT need check_permission.",
      parameters: {
        type: "object",
        properties: {
          role: { type: "string", description: "Target role (e.g. 'Product Manager Intern')." },
          company: { type: "string", description: "Target company." },
          domain: { type: "string", description: "Functional domain / industry hint." },
          required_skills: { type: "array", items: { type: "string" }, description: "Required skills extracted from JD." },
          preferred_skills: { type: "array", items: { type: "string" }, description: "Preferred / nice-to-have skills." },
          seniority: { type: "string", description: "JD seniority (Intern/Junior/Mid/Senior/Lead/Director/VP)." },
          sources: { type: "array", items: { type: "string", enum: ["MU","ALU","EXT"] }, description: "Mentor pools to search. Defaults to all three." },
          limit: { type: "number", description: "Max mentors to return (default 6, max 12)." },
        },
        required: ["role"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_mentors_for_lmp",
      description: "Find and rank mentors for a specific LMP process by id. Hydrates role/company/domain/skills/seniority directly from the LMP record (lmp_processes), then ranks mentors from mentors_union_view (MU + ALU mirror + EXT). Use this when the user asks 'find mentors for this LMP', 'recommend mentors for <company> · <role>' AFTER you've resolved the LMP id, or any time the JD context lives on the LMP record itself. If the LMP has no JD context, returns an error asking the user to run parse_jd first. Read-only; does NOT need check_permission. Render results as a `mentor-shortlist-card` with assign_action_template just like find_mentors_for_jd.",
      parameters: {
        type: "object",
        properties: {
          lmp_id: { type: "string", description: "UUID of the LMP process. Use resolve_entity first if you only have a name." },
          sources: { type: "array", items: { type: "string", enum: ["MU","ALU","EXT"] }, description: "Mentor pools to search. Defaults to all three." },
          limit: { type: "number", description: "Max mentors to return (default 6, max 12)." },
        },
        required: ["lmp_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "make_plan",
      description: "Create a multi-step execution plan for a complex user request. Call this FIRST (before other tools) when the request requires 2+ distinct operations (e.g. 'parse this JD then find mentors then assign top one', 'update status to Converted and reassign POC and notify'). Returns a plan_id and the canonical step list with status='pending'. Single-step intents (a single search, single status change, single lookup) MUST NOT call this tool — go straight to the relevant tool. After calling make_plan, execute the steps in order using their referenced tools, then call update_plan_step after each step to mark progress. The final response MUST include a single plan-card block reflecting the latest step statuses.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", description: "Plain-English summary of the user's goal." },
          steps: {
            type: "array",
            description: "Ordered list of steps the agent intends to execute.",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Stable short id (e.g. s1, s2)." },
                title: { type: "string", description: "Short imperative title (e.g. 'Resolve mentor by name')." },
                detail: { type: "string", description: "One-line description of what the step does." },
                tool: { type: "string", description: "Underlying tool name the step will call." },
                depends_on: { type: "array", items: { type: "string" }, description: "Step ids that must finish first." },
              },
              required: ["id", "title"],
              additionalProperties: false,
            },
          },
        },
        required: ["goal", "steps"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_plan_step",
      description: "Update the status of a single plan step. Call this immediately AFTER each underlying tool call so the plan-card stays in sync. Allowed statuses: in_progress (just started), done (succeeded), failed (errored — include result_summary), skipped (no longer needed).",
      parameters: {
        type: "object",
        properties: {
          plan_id: { type: "string", description: "Plan id returned by make_plan." },
          step_id: { type: "string", description: "Step id to update." },
          status: { type: "string", enum: ["in_progress", "done", "failed", "skipped"] },
          result_summary: { type: "string", description: "Optional 1-line outcome (mandatory when status=failed)." },
        },
        required: ["plan_id", "step_id", "status"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the live public web for current external facts via Google Search grounding. " +
        "Use ONLY for external/current real-world facts not in the platform DB — company background, news, funding rounds, leadership changes, industry trends, and general knowledge. " +
        "NEVER use for student/LMP/POC/mentor data — those have dedicated tools (search_lmp_records, get_student_profile, search_students, list_entities, find_mentors_for_jd, etc.). " +
        "Read-only; no permission check required.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Concise web search question about external/current facts." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
];
