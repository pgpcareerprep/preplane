use crate::arbitration::arbitrate;
use crate::category::{category_for_sub_intent, rules_confidence};
use crate::context::RouterContext;
use crate::rules::classify_sub_intent;
use crate::semantic;
use crate::similarity;
use preplane_contracts::{IntentDecision, SignalVote};
use std::time::Instant;

pub struct ClassifyOptions<'a> {
    pub utterance: &'a str,
    pub ctx: &'a RouterContext,
    pub semantic_classifier_url: Option<&'a str>,
    pub use_remote_semantic: bool,
}

pub async fn classify(opts: ClassifyOptions<'_>) -> IntentDecision {
    let started = Instant::now();
    let sub = classify_sub_intent(opts.utterance);
    let rules_cat = category_for_sub_intent(sub);
    let rules = SignalVote {
        category: rules_cat,
        confidence: rules_confidence(sub),
    };
    let similarity = similarity::similarity_vote(opts.utterance);
    let semantic = if opts.use_remote_semantic {
        semantic::semantic_vote(opts.utterance, opts.semantic_classifier_url).await
    } else {
        semantic::fallback_vote(opts.utterance)
    };

    let decision = arbitrate(sub, rules, semantic, similarity, opts.ctx);
    tracing::info!(
        elapsed_ms = started.elapsed().as_millis() as u64,
        category = ?decision.category,
        sub_intent = %decision.sub_intent,
        confidence = decision.confidence,
        view_as = opts.ctx.is_view_as(),
        "intent_decision"
    );
    decision
}

pub fn classify_sync(utterance: &str, ctx: &RouterContext) -> IntentDecision {
    let sub = classify_sub_intent(utterance);
    let rules = SignalVote {
        category: category_for_sub_intent(sub),
        confidence: rules_confidence(sub),
    };
    let semantic = semantic::fallback_vote(utterance);
    let similarity = similarity::similarity_vote(utterance);
    arbitrate(sub, rules, semantic, similarity, ctx)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rules::CopilotSubIntent;
    use preplane_contracts::IntentCategory;

    #[test]
    fn view_as_downgrades_command() {
        let ctx = RouterContext {
            role: "admin".into(),
            real_role: "admin".into(),
            view_as_role: Some("poc".into()),
            view_as_user_name: Some("Sam".into()),
            ..Default::default()
        };
        let d = classify_sync("update Acme PM status to On Hold", &ctx);
        assert_ne!(d.category, IntentCategory::Command);
        assert_eq!(d.sub_intent, CopilotSubIntent::UpdateLmp.as_str());
    }

    #[test]
    fn greetings_not_command() {
        let ctx = RouterContext::default();
        let d = classify_sync("hello", &ctx);
        assert_ne!(d.category, IntentCategory::Command);
        assert_ne!(d.category, IntentCategory::Reasoning);
        assert_ne!(d.category, IntentCategory::Workflow);
    }
}
