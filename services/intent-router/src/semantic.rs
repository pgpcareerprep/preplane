use preplane_contracts::{IntentCategory, SignalVote};
use serde::Deserialize;
use std::time::Duration;

#[derive(Debug, Deserialize)]
struct ClassifyResponse {
    category: IntentCategory,
    confidence: f64,
}

pub async fn semantic_vote(utterance: &str, base_url: Option<&str>) -> SignalVote {
    let Some(url) = base_url else {
        return fallback_vote(utterance);
    };
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(50))
        .build()
        .ok();
    let Some(client) = client else {
        return fallback_vote(utterance);
    };

    let endpoint = format!("{}/classify", url.trim_end_matches('/'));
    let resp = client
        .post(endpoint)
        .json(&serde_json::json!({ "utterance": utterance }))
        .send()
        .await;

    match resp {
        Ok(r) if r.status().is_success() => match r.json::<ClassifyResponse>().await {
            Ok(body) => SignalVote {
                category: body.category,
                confidence: body.confidence,
            },
            Err(_) => fallback_vote(utterance),
        },
        _ => fallback_vote(utterance),
    }
}

/// Local keyword scorer used when the Python service is offline.
pub fn fallback_vote(utterance: &str) -> SignalVote {
    let msg = utterance.to_ascii_lowercase();
    let mut best = (IntentCategory::Unknown, 0.35_f64);
    let buckets: &[(IntentCategory, &[&str])] = &[
        (IntentCategory::Command, &["update", "delete", "assign", "create lmp", "mark", "convert"]),
        (IntentCategory::Query, &["search", "show", "list", "find", "how many", "workload", "progress of"]),
        (
            IntentCategory::Reasoning,
            &["mentor", "case study", "parse jd", "jd", "cv", "recommend poc"],
        ),
        (
            IntentCategory::Workflow,
            &["make plan", "and then", "first parse", "then assign", "then find"],
        ),
    ];
    for (cat, keys) in buckets {
        let hits = keys.iter().filter(|k| msg.contains(**k)).count();
        if hits == 0 {
            continue;
        }
        let conf = (0.45 + hits as f64 * 0.12).min(0.88);
        if conf > best.1 {
            best = (*cat, conf);
        }
    }
    SignalVote {
        category: best.0,
        confidence: best.1,
    }
}
