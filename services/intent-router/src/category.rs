use crate::rules::CopilotSubIntent;
use preplane_contracts::IntentCategory;

pub fn category_for_sub_intent(sub: CopilotSubIntent) -> IntentCategory {
    match sub {
        CopilotSubIntent::Greeting
        | CopilotSubIntent::Help
        | CopilotSubIntent::PlatformSummary
        | CopilotSubIntent::GeneralChat
        | CopilotSubIntent::VoiceCommand
        | CopilotSubIntent::Unknown => IntentCategory::Unknown,
        CopilotSubIntent::StudentSearch
        | CopilotSubIntent::StudentProgress
        | CopilotSubIntent::LmpProcessSearch
        | CopilotSubIntent::AttentionNeeded
        | CopilotSubIntent::EntityListing
        | CopilotSubIntent::CompareProgress
        | CopilotSubIntent::AnalyticsQuery
        | CopilotSubIntent::DashboardQuery
        | CopilotSubIntent::AlumniMatching
        | CopilotSubIntent::PocAllocation => IntentCategory::Query,
        CopilotSubIntent::CreateLmp
        | CopilotSubIntent::UpdateLmp
        | CopilotSubIntent::DeleteLmp
        | CopilotSubIntent::SheetSync => IntentCategory::Command,
        CopilotSubIntent::CaseStudy
        | CopilotSubIntent::MentorMatching => IntentCategory::Reasoning,
        CopilotSubIntent::ReportGeneration | CopilotSubIntent::MultiStepPlan => IntentCategory::Workflow,
    }
}

pub fn rules_confidence(sub: CopilotSubIntent) -> f64 {
    match sub {
        CopilotSubIntent::Greeting | CopilotSubIntent::Help => 0.98,
        CopilotSubIntent::CaseStudy
        | CopilotSubIntent::CreateLmp
        | CopilotSubIntent::UpdateLmp
        | CopilotSubIntent::DeleteLmp
        | CopilotSubIntent::MultiStepPlan => 0.92,
        CopilotSubIntent::Unknown => 0.2,
        _ => 0.85,
    }
}
