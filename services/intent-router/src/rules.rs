use regex::Regex;
use std::sync::LazyLock;

/// Fine-grained intents ported from `copilot-ai/intentRouter.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CopilotSubIntent {
    Greeting,
    GeneralChat,
    Help,
    PlatformSummary,
    StudentSearch,
    StudentProgress,
    LmpProcessSearch,
    AttentionNeeded,
    CreateLmp,
    CaseStudy,
    UpdateLmp,
    DeleteLmp,
    CompareProgress,
    PocAllocation,
    MentorMatching,
    AlumniMatching,
    DashboardQuery,
    AnalyticsQuery,
    SheetSync,
    ReportGeneration,
    VoiceCommand,
    EntityListing,
    MultiStepPlan,
    Unknown,
}

impl CopilotSubIntent {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Greeting => "greeting",
            Self::GeneralChat => "general_chat",
            Self::Help => "help",
            Self::PlatformSummary => "platform_summary",
            Self::StudentSearch => "student_search",
            Self::StudentProgress => "student_progress",
            Self::LmpProcessSearch => "lmp_process_search",
            Self::AttentionNeeded => "attention_needed",
            Self::CreateLmp => "create_lmp",
            Self::CaseStudy => "case_study",
            Self::UpdateLmp => "update_lmp",
            Self::DeleteLmp => "delete_lmp",
            Self::CompareProgress => "compare_progress",
            Self::PocAllocation => "poc_allocation",
            Self::MentorMatching => "mentor_matching",
            Self::AlumniMatching => "alumni_matching",
            Self::DashboardQuery => "dashboard_query",
            Self::AnalyticsQuery => "analytics_query",
            Self::SheetSync => "sheet_sync",
            Self::ReportGeneration => "report_generation",
            Self::VoiceCommand => "voice_command",
            Self::EntityListing => "entity_listing",
            Self::MultiStepPlan => "multi_step_plan",
            Self::Unknown => "unknown",
        }
    }
}

static GREETING: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(?i)(hi|hey+|hello+|howdy|hiya|yo|sup|good\s+(morning|afternoon|evening|night)|how are you|how's it going|what'?s up|wassup|greetings|namaste)\W*$").unwrap());
static HELP: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(help|how do i|what can you do|show me how|guide|tutorial|usage|commands|capabilities)\b").unwrap()
});
static CASE_STUDY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(case\s*stud(?:y|ies|e\w?)|casestud\w*|interview\s+case)\b").unwrap()
});
static PLATFORM_SUMMARY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(overview|summary|dashboard|status|total|all processes|give me a summary|executive|big picture|report card)\b").unwrap()
});
static STUDENT_PROGRESS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(progress of|how is .* doing|status of .* student|update on|tracking .* student)\b").unwrap()
});
static STUDENT_SEARCH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(student|candidate|find student|search student|look up|who is|profile of)\b").unwrap()
});
static ATTENTION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(attention|today|urgent|need my|at.?risk|stale|stuck|delayed|bottleneck|overdue|sla breach)\b").unwrap()
});
static CREATE_LMP: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(create|add|new|start|initiate|open)\b.*\b(lmp|process|record)\b").unwrap()
});
static UPDATE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(\b(update|change|set|mark|move|edit|modify|convert|close|archive)\b[^.?!\n]{0,40}\b(lmp|process|requisition|status|stage|domain|poc|owner|allocator|company|role|record)\b|\b(lmp|process|status|stage|domain|poc|record)\b[^.?!\n]{0,40}\b(update|change|set|mark|move|edit|modify|convert|close|archive)\b)").unwrap()
});
static DELETE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\b(delete|remove|archive|soft.?delete)\b").unwrap());
static POC: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(poc|assign|allocate|point of contact|prep poc|outreach poc)\b").unwrap()
});
static MENTOR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(mentor|recommend mentor|find mentor|mentor matching)\b").unwrap()
});
static ALUMNI: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\b(alumni|alum|alu)\b").unwrap());
static ANALYTICS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(analytic|metric|kpi|rate|trend|breakdown|distribution|workload|conversion|chart|graph|funnel)\b").unwrap()
});
static COMPARE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\b(compare|vs|versus|difference between|contrast)\b").unwrap());
static ENTITY_LISTING: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(\b(list all|show all|all the|how many|total|count of|who are the)\b.*\b(poc|pocs|student|students|mentor|mentors|alumni)\b|\b(poc|pocs|student|students|mentor|mentors|alumni)\b.*\b(list|all|count|total)\b)").unwrap()
});
static HELP_WITH_TASK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(?:help\s+(?:me\s+)?|how do i\s+)(?:create|make|generate|prepare|draft|build|write|find|get|show|list|search|update|assign|match|parse|analyze|download|export|with)\b").unwrap()
});
static WORKFLOW: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(\bmake[_ ]plan\b|\b(and then|then also|first .{3,60} then)\b|\bparse .+ (and|then) .+(mentor|assign|poc)\b)").unwrap()
});

pub fn is_case_study_query(message: &str) -> bool {
    CASE_STUDY.is_match(message.trim())
}

pub fn is_genuine_help_request(message: &str) -> bool {
    let msg = message.trim();
    if msg.is_empty() {
        return false;
    }
    if is_case_study_query(msg) {
        return false;
    }
    if HELP_WITH_TASK.is_match(msg) {
        return false;
    }
    HELP.is_match(msg)
}

pub fn is_create_lmp_query(message: &str) -> bool {
    let msg = message.trim();
    if msg.is_empty() || is_case_study_query(msg) {
        return false;
    }
    CREATE_LMP.is_match(msg)
}

/// Verbatim port of `classifyIntent` in intentRouter.ts (+ workflow pre-emption).
pub fn classify_sub_intent(user_message: &str) -> CopilotSubIntent {
    let msg = user_message.trim();
    if msg.is_empty() {
        return CopilotSubIntent::Unknown;
    }
    if WORKFLOW.is_match(msg) {
        return CopilotSubIntent::MultiStepPlan;
    }
    if GREETING.is_match(msg) {
        return CopilotSubIntent::Greeting;
    }
    if is_case_study_query(msg) {
        return CopilotSubIntent::CaseStudy;
    }
    if is_genuine_help_request(msg) {
        return CopilotSubIntent::Help;
    }
    if ENTITY_LISTING.is_match(msg) {
        return CopilotSubIntent::EntityListing;
    }
    if STUDENT_PROGRESS.is_match(msg) {
        return CopilotSubIntent::StudentProgress;
    }
    if STUDENT_SEARCH.is_match(msg) {
        return CopilotSubIntent::StudentSearch;
    }
    if ATTENTION.is_match(msg) {
        return CopilotSubIntent::AttentionNeeded;
    }
    if is_create_lmp_query(msg) {
        return CopilotSubIntent::CreateLmp;
    }
    if DELETE.is_match(msg) {
        return CopilotSubIntent::DeleteLmp;
    }
    if UPDATE.is_match(msg) {
        return CopilotSubIntent::UpdateLmp;
    }
    if ALUMNI.is_match(msg) {
        return CopilotSubIntent::AlumniMatching;
    }
    if MENTOR.is_match(msg) {
        return CopilotSubIntent::MentorMatching;
    }
    if POC.is_match(msg) {
        return CopilotSubIntent::PocAllocation;
    }
    if COMPARE.is_match(msg) {
        return CopilotSubIntent::CompareProgress;
    }
    if ANALYTICS.is_match(msg) {
        return CopilotSubIntent::AnalyticsQuery;
    }
    if PLATFORM_SUMMARY.is_match(msg) {
        return CopilotSubIntent::PlatformSummary;
    }
    CopilotSubIntent::Unknown
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greeting_and_help_parity() {
        assert_eq!(classify_sub_intent("hi"), CopilotSubIntent::Greeting);
        assert_eq!(classify_sub_intent("help"), CopilotSubIntent::Help);
        assert_eq!(classify_sub_intent("what can you do?"), CopilotSubIntent::Help);
    }

    #[test]
    fn case_study_not_help() {
        let msg = "help me create a case study for Xoxoday";
        assert_eq!(classify_sub_intent(msg), CopilotSubIntent::CaseStudy);
    }
}
