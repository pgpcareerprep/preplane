//! Labeled utterance fixtures (≥120) for parity with copilot-ai/intentRouter.ts.

use preplane_intent_router::rules::{classify_sub_intent, CopilotSubIntent};
use preplane_intent_router::{classify_sync, context::RouterContext};
use preplane_contracts::IntentCategory;
use std::time::Instant;

fn case(utterance: &'static str, expected: CopilotSubIntent) -> (&'static str, CopilotSubIntent) {
    (utterance, expected)
}

fn fixtures() -> Vec<(&'static str, CopilotSubIntent)> {
    vec![
        // Greetings (12)
        case("hi", CopilotSubIntent::Greeting),
        case("hey", CopilotSubIntent::Greeting),
        case("hello", CopilotSubIntent::Greeting),
        case("good morning", CopilotSubIntent::Greeting),
        case("howdy", CopilotSubIntent::Greeting),
        case("what's up", CopilotSubIntent::Greeting),
        case("namaste", CopilotSubIntent::Greeting),
        case("yo", CopilotSubIntent::Greeting),
        case("hiya", CopilotSubIntent::Greeting),
        case("good evening", CopilotSubIntent::Greeting),
        case("how are you", CopilotSubIntent::Greeting),
        case("greetings", CopilotSubIntent::Greeting),
        // Help (10)
        case("help", CopilotSubIntent::Help),
        case("what can you do?", CopilotSubIntent::Help),
        case("show me how to use the copilot", CopilotSubIntent::Help),
        case("guide me", CopilotSubIntent::Help),
        case("tutorial please", CopilotSubIntent::Help),
        case("usage instructions", CopilotSubIntent::Help),
        case("commands list", CopilotSubIntent::Help),
        case("capabilities", CopilotSubIntent::Help),
        case("how do I use this", CopilotSubIntent::Help),
        case("copilot usage guide", CopilotSubIntent::Help),
        // Case study (8)
        case("create a case study for Stripe PM", CopilotSubIntent::CaseStudy),
        case("help me create a case study for Xoxoday", CopilotSubIntent::CaseStudy),
        case("interview case for Google", CopilotSubIntent::CaseStudy),
        case("casestudy for Acme", CopilotSubIntent::CaseStudy),
        case("generate case study from jd", CopilotSubIntent::CaseStudy),
        case("prepare a case study brief", CopilotSubIntent::CaseStudy),
        case("case studies for fintech PM", CopilotSubIntent::CaseStudy),
        case("how do I create a case study for Stripe PM", CopilotSubIntent::CaseStudy),
        // Create LMP (10)
        case("create a new LMP for Google PM", CopilotSubIntent::CreateLmp),
        case("start a new process for Stripe", CopilotSubIntent::CreateLmp),
        case("add new lmp record for Acme", CopilotSubIntent::CreateLmp),
        case("initiate process for Meta", CopilotSubIntent::CreateLmp),
        case("open a new lmp for Amazon", CopilotSubIntent::CreateLmp),
        case("create lmp for Flipkart SDE", CopilotSubIntent::CreateLmp),
        case("add process for Uber", CopilotSubIntent::CreateLmp),
        case("new record for Netflix PM", CopilotSubIntent::CreateLmp),
        case("start lmp for Swiggy", CopilotSubIntent::CreateLmp),
        case("create new process for Razorpay", CopilotSubIntent::CreateLmp),
        // Update (12)
        case("update Acme PM status to On Hold", CopilotSubIntent::UpdateLmp),
        case("mark Google LMP as converted", CopilotSubIntent::UpdateLmp),
        case("change Stripe process status", CopilotSubIntent::UpdateLmp),
        case("set domain for Meta LMP", CopilotSubIntent::UpdateLmp),
        case("move Acme to interview stage", CopilotSubIntent::UpdateLmp),
        case("edit role for Amazon process", CopilotSubIntent::UpdateLmp),
        case("modify poc for Uber LMP", CopilotSubIntent::UpdateLmp),
        case("convert Flipkart PM lmp", CopilotSubIntent::UpdateLmp),
        case("close the Netflix process", CopilotSubIntent::UpdateLmp),
        case("archive old Acme record", CopilotSubIntent::DeleteLmp),
        case("lmp status update for Swiggy", CopilotSubIntent::UpdateLmp),
        case("status change for Razorpay PM", CopilotSubIntent::UpdateLmp),
        // Delete (8)
        case("delete Acme LMP", CopilotSubIntent::DeleteLmp),
        case("remove Google process", CopilotSubIntent::DeleteLmp),
        case("soft delete Stripe record", CopilotSubIntent::DeleteLmp),
        case("delete this lmp", CopilotSubIntent::DeleteLmp),
        case("remove the process", CopilotSubIntent::DeleteLmp),
        case("archive and delete Meta", CopilotSubIntent::DeleteLmp),
        case("delete lmp for Uber", CopilotSubIntent::DeleteLmp),
        case("remove this lmp record", CopilotSubIntent::DeleteLmp),
        // Mentor (10)
        case("find mentor for Stripe", CopilotSubIntent::MentorMatching),
        case("mentor matching for Acme", CopilotSubIntent::MentorMatching),
        case("recommend mentor for jd", CopilotSubIntent::MentorMatching),
        case("mentor for Meta process", CopilotSubIntent::MentorMatching),
        case("recommend mentor shortlist", CopilotSubIntent::MentorMatching),
        case("mentor shortlist", CopilotSubIntent::MentorMatching),
        // POC (10)
        case("assign POC for Acme", CopilotSubIntent::PocAllocation),
        case("allocate poc for Google", CopilotSubIntent::PocAllocation),
        case("recommend prep poc", CopilotSubIntent::PocAllocation),
        case("point of contact for Stripe", CopilotSubIntent::PocAllocation),
        case("show poc workload", CopilotSubIntent::PocAllocation),
        case("assign point of contact", CopilotSubIntent::PocAllocation),
        case("prep poc for Meta", CopilotSubIntent::PocAllocation),
        case("outreach poc suggestion", CopilotSubIntent::PocAllocation),
        case("allocate point of contact", CopilotSubIntent::PocAllocation),
        case("poc assignment for Uber", CopilotSubIntent::PocAllocation),
        // Analytics (12)
        case("conversion rate breakdown", CopilotSubIntent::AnalyticsQuery),
        case("domain distribution chart", CopilotSubIntent::AnalyticsQuery),
        case("pipeline funnel metrics", CopilotSubIntent::AnalyticsQuery),
        case("kpi dashboard", CopilotSubIntent::AnalyticsQuery),
        case("trend for conversions", CopilotSubIntent::AnalyticsQuery),
        case("graph of status distribution", CopilotSubIntent::AnalyticsQuery),
        case("metric breakdown by domain", CopilotSubIntent::AnalyticsQuery),
        case("conversion trend", CopilotSubIntent::AnalyticsQuery),
        case("workload chart", CopilotSubIntent::AnalyticsQuery),
        case("distribution by status", CopilotSubIntent::AnalyticsQuery),
        case("funnel conversion metrics", CopilotSubIntent::AnalyticsQuery),
        case("metric breakdown chart", CopilotSubIntent::AnalyticsQuery),
        // Entity listing (10)
        case("list all pocs", CopilotSubIntent::EntityListing),
        case("show all students", CopilotSubIntent::EntityListing),
        case("how many mentors", CopilotSubIntent::EntityListing),
        case("count of alumni", CopilotSubIntent::EntityListing),
        case("who are the pocs", CopilotSubIntent::EntityListing),
        case("all the students", CopilotSubIntent::EntityListing),
        case("total mentors list", CopilotSubIntent::EntityListing),
        case("list all mentors", CopilotSubIntent::EntityListing),
        case("show all pocs", CopilotSubIntent::EntityListing),
        case("students count", CopilotSubIntent::EntityListing),
        // Student search (10)
        case("find student Rahul", CopilotSubIntent::StudentSearch),
        case("search student Priya", CopilotSubIntent::StudentSearch),
        case("who is candidate Amit", CopilotSubIntent::StudentSearch),
        case("profile of student Neha", CopilotSubIntent::StudentSearch),
        case("look up student record", CopilotSubIntent::StudentSearch),
        case("candidate search", CopilotSubIntent::StudentSearch),
        case("student named Karan", CopilotSubIntent::StudentSearch),
        case("find candidate profile", CopilotSubIntent::StudentSearch),
        case("who is the student", CopilotSubIntent::StudentSearch),
        case("search candidate list", CopilotSubIntent::StudentSearch),
        // Student progress (8)
        case("progress of Rahul", CopilotSubIntent::StudentProgress),
        case("how is Priya doing", CopilotSubIntent::StudentProgress),
        case("status of Amit student", CopilotSubIntent::StudentProgress),
        case("update on Neha", CopilotSubIntent::StudentProgress),
        case("tracking Karan student", CopilotSubIntent::StudentProgress),
        case("progress of student Sam", CopilotSubIntent::StudentProgress),
        case("how is student doing", CopilotSubIntent::StudentProgress),
        case("progress of student Maya", CopilotSubIntent::StudentProgress),
        // Attention (8)
        case("who needs attention today", CopilotSubIntent::AttentionNeeded),
        case("stale processes", CopilotSubIntent::AttentionNeeded),
        case("urgent lmp list", CopilotSubIntent::AttentionNeeded),
        case("stuck processes", CopilotSubIntent::AttentionNeeded),
        case("sla breach list", CopilotSubIntent::AttentionNeeded),
        case("overdue items", CopilotSubIntent::AttentionNeeded),
        case("bottleneck today", CopilotSubIntent::AttentionNeeded),
        case("at risk processes", CopilotSubIntent::AttentionNeeded),
        // Workflow (10)
        case("parse jd and then find mentors", CopilotSubIntent::MultiStepPlan),
        case("make plan for onboarding", CopilotSubIntent::MultiStepPlan),
        case("first parse jd then assign poc", CopilotSubIntent::MultiStepPlan),
        case("parse this jd and then assign top mentor", CopilotSubIntent::MultiStepPlan),
        case("make_plan for hiring pipeline", CopilotSubIntent::MultiStepPlan),
        case("find mentors and then update status", CopilotSubIntent::MultiStepPlan),
        case("first search lmp then assign poc", CopilotSubIntent::MultiStepPlan),
        case("parse jd then find mentors then assign", CopilotSubIntent::MultiStepPlan),
        case("and then assign the best mentor", CopilotSubIntent::MultiStepPlan),
        case("then also update the status", CopilotSubIntent::MultiStepPlan),
        // Compare (6)
        case("compare Rahul vs Priya", CopilotSubIntent::CompareProgress),
        case("difference between two students", CopilotSubIntent::CompareProgress),
        case("contrast Acme and Google", CopilotSubIntent::CompareProgress),
        case("versus last month", CopilotSubIntent::CompareProgress),
        case("compare progress", CopilotSubIntent::CompareProgress),
        case("vs prior cohort", CopilotSubIntent::CompareProgress),
        // Alumni (6)
        case("alumni list", CopilotSubIntent::EntityListing),
        case("find alum from 2024", CopilotSubIntent::AlumniMatching),
        case("alu network", CopilotSubIntent::AlumniMatching),
        case("alumni mentors", CopilotSubIntent::AlumniMatching),
        case("show alumni", CopilotSubIntent::AlumniMatching),
        case("alum matches", CopilotSubIntent::AlumniMatching),
        // Platform summary (8)
        case("pipeline summary", CopilotSubIntent::PlatformSummary),
        case("executive overview", CopilotSubIntent::PlatformSummary),
        case("big picture status", CopilotSubIntent::PlatformSummary),
        case("give me a summary", CopilotSubIntent::PlatformSummary),
        case("dashboard overview", CopilotSubIntent::PlatformSummary),
        case("all processes status", CopilotSubIntent::PlatformSummary),
        case("report card", CopilotSubIntent::PlatformSummary),
        case("total overview", CopilotSubIntent::PlatformSummary),
    ]
}

#[test]
fn fixture_count_at_least_120() {
    assert!(fixtures().len() >= 120, "need ≥120 labeled utterances");
}

#[test]
fn sub_intent_classification_parity() {
    let mut mismatches = Vec::new();
    for (utterance, expected) in fixtures() {
        let got = classify_sub_intent(utterance);
        if got != expected {
            mismatches.push((utterance, expected.as_str(), got.as_str()));
        }
    }
    assert!(
        mismatches.is_empty(),
        "mismatches: {:?}",
        &mismatches[..mismatches.len().min(10)]
    );
}

#[test]
fn greetings_and_help_never_route_to_tool_categories() {
    let ctx = RouterContext::default();
    for (utterance, _) in fixtures() {
        let sub = classify_sub_intent(utterance);
        if sub != CopilotSubIntent::Greeting && sub != CopilotSubIntent::Help {
            continue;
        }
        let d = classify_sync(utterance, &ctx);
        assert_ne!(d.category, IntentCategory::Command);
        assert_ne!(d.category, IntentCategory::Reasoning);
        assert_ne!(d.category, IntentCategory::Workflow);
    }
}

#[test]
fn rules_only_path_under_40ms_p95() {
    let ctx = RouterContext::default();
    let mut samples = Vec::with_capacity(500);
    for (utterance, _) in fixtures() {
        for _ in 0..3 {
            let t0 = Instant::now();
            let _ = classify_sync(utterance, &ctx);
            samples.push(t0.elapsed());
        }
    }
    samples.sort();
    let p95_idx = (samples.len() as f64 * 0.95).floor() as usize;
    let p95 = samples[p95_idx.min(samples.len() - 1)];
    assert!(
        p95.as_millis() < 40,
        "p95 {:?} exceeds 40ms budget",
        p95
    );
}
