use crate::category::category_for_sub_intent;
use crate::context::RouterContext;
use crate::rules::CopilotSubIntent;
use preplane_contracts::{ExtractedEntity, IntentCategory, IntentDecision, IntentSignals, SignalVote};

const HIGH_PRECISION: &[CopilotSubIntent] = &[
    CopilotSubIntent::Greeting,
    CopilotSubIntent::Help,
    CopilotSubIntent::CaseStudy,
    CopilotSubIntent::MultiStepPlan,
];

pub fn arbitrate(
    sub_intent: CopilotSubIntent,
    rules: SignalVote,
    semantic: SignalVote,
    similarity: SignalVote,
    ctx: &RouterContext,
) -> IntentDecision {
    let mut category = if HIGH_PRECISION.contains(&sub_intent) && rules.confidence >= 0.9 {
        rules.category
    } else {
        weighted_vote(&rules, &semantic, &similarity)
    };

    if ctx.is_view_as() && category == IntentCategory::Command {
        category = IntentCategory::Query;
    }

    let confidence = [rules.confidence, semantic.confidence, similarity.confidence]
        .into_iter()
        .fold(0.0_f64, f64::max)
        .clamp(0.0, 1.0);

    let mut entities = Vec::new();
    if ctx.is_view_as() && category != IntentCategory::Command {
        if let Some(name) = &ctx.view_as_user_name {
            entities.push(ExtractedEntity {
                kind: "view_as".to_string(),
                value: name.clone(),
                entity_id: None,
            });
        }
    }

    IntentDecision {
        category,
        sub_intent: sub_intent.as_str().to_string(),
        confidence,
        signals: IntentSignals {
            rules,
            semantic,
            similarity,
        },
        entities,
    }
}

fn weighted_vote(rules: &SignalVote, semantic: &SignalVote, similarity: &SignalVote) -> IntentCategory {
    let mut scores = [
        (rules.category, rules.confidence * 0.45),
        (semantic.category, semantic.confidence * 0.35),
        (similarity.category, similarity.confidence * 0.20),
    ];
    scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    if scores[0].1 < 0.35 {
        IntentCategory::Unknown
    } else {
        scores[0].0
    }
}
