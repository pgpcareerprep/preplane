use preplane_contracts::{IntentCategory, SignalVote};

/// pgvector similarity vote — disabled until embedding endpoint is wired (Phase 2+).
pub fn similarity_vote(_utterance: &str) -> SignalVote {
    SignalVote {
        category: IntentCategory::Unknown,
        confidence: 0.0,
    }
}
