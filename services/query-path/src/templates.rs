use crate::scope::{apply_poc_read_scope, matches_filter, matches_poc_filter};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

const ALLOWED_SEARCH_PARAMS: &[&str] = &[
    "company",
    "role",
    "domain",
    "status",
    "mentor_aligned",
    "poc",
    "type",
    "updated_since",
    "updated_within_days",
    "sort",
    "limit",
    "scope_org_wide",
];

const ALLOWED_ANALYTICS_METRICS: &[&str] = &[
    "status_distribution",
    "domain_distribution",
    "poc_workload",
    "conversion_rate",
    "type_distribution",
    "age_tracking",
    "overview",
    "pipeline_summary",
];

pub fn reject_unknown_params(args: &Value, allowed: &[&str]) -> Option<String> {
    let Some(obj) = args.as_object() else {
        return None;
    };
    for key in obj.keys() {
        if !allowed.contains(&key.as_str()) {
            return Some(format!("Unknown parameter: {key}"));
        }
    }
    None
}

pub fn infer_company_from_utterance(utterance: &str) -> Option<String> {
    let lower = utterance.to_lowercase();
    for prefix in ["for ", "at ", "from "] {
        if let Some(idx) = lower.rfind(prefix) {
            let tail = utterance[idx + prefix.len()..].trim();
            if !tail.is_empty() {
                let company = tail
                    .split(|c: char| c == ',' || c == '?' || c == '.')
                    .next()
                    .unwrap_or(tail)
                    .trim()
                    .to_string();
                if company.len() >= 2 {
                    return Some(company);
                }
            }
        }
    }
    None
}

pub fn search_lmp_records(
    records: Vec<HashMap<String, String>>,
    role: Option<&str>,
    user_name: Option<&str>,
    args: &Value,
) -> Result<Value, String> {
    if let Some(err) = reject_unknown_params(args, ALLOWED_SEARCH_PARAMS) {
        return Err(err);
    }
    let mut filtered = apply_poc_read_scope(records, role, user_name, args);
    if let Some(company) = args.get("company").and_then(Value::as_str) {
        filtered.retain(|r| matches_filter(r.get("Company").map(String::as_str).unwrap_or(""), company));
    }
    if let Some(role_filter) = args.get("role").and_then(Value::as_str) {
        filtered.retain(|r| matches_filter(r.get("Role").map(String::as_str).unwrap_or(""), role_filter));
    }
    if let Some(domain) = args.get("domain").and_then(Value::as_str) {
        filtered.retain(|r| matches_filter(r.get("Domain").map(String::as_str).unwrap_or(""), domain));
    }
    if let Some(status) = args.get("status").and_then(Value::as_str) {
        filtered.retain(|r| matches_filter(r.get("Status").map(String::as_str).unwrap_or(""), status));
    }
    if let Some(mentor_aligned) = args.get("mentor_aligned").and_then(Value::as_bool) {
        filtered.retain(|r| {
            let val = r.get("Mentor Aligned").map(String::as_str).unwrap_or("");
            let truthy = matches!(val.to_lowercase().as_str(), "true" | "yes" | "1");
            truthy == mentor_aligned
        });
    }
    if let Some(poc) = args.get("poc").and_then(Value::as_str) {
        filtered.retain(|r| {
            matches_poc_filter(r.get("Prep POC").map(String::as_str).unwrap_or(""), poc)
                || matches_poc_filter(r.get("Outreach POC").map(String::as_str).unwrap_or(""), poc)
                || matches_poc_filter(r.get("Support POC").map(String::as_str).unwrap_or(""), poc)
                || matches_poc_filter(r.get("Secondary POC").map(String::as_str).unwrap_or(""), poc)
        });
    }
    if let Some(kind) = args.get("type").and_then(Value::as_str) {
        filtered.retain(|r| matches_filter(r.get("Type").map(String::as_str).unwrap_or(""), kind));
    }
    if let Some(sort) = args.get("sort").and_then(Value::as_str) {
        if sort == "recent" || sort == "oldest_activity" {
            let dir = if sort == "recent" { -1 } else { 1 };
            filtered.sort_by(|a, b| {
                let ta = chrono::DateTime::parse_from_rfc3339(
                    a.get("Last Updated").map(String::as_str).unwrap_or(""),
                )
                .map(|d| d.timestamp())
                .unwrap_or(0);
                let tb = chrono::DateTime::parse_from_rfc3339(
                    b.get("Last Updated").map(String::as_str).unwrap_or(""),
                )
                .map(|d| d.timestamp())
                .unwrap_or(0);
                if dir < 0 {
                    tb.cmp(&ta)
                } else {
                    ta.cmp(&tb)
                }
            });
        }
    }
    let limit_raw = args.get("limit").and_then(Value::as_u64).unwrap_or(200) as usize;
    let limit = if limit_raw == 0 { filtered.len() } else { limit_raw };
    let truncated = filtered.len() > limit;
    Ok(json!({
        "total_count": filtered.len(),
        "returned_count": filtered.len().min(limit),
        "truncated": truncated,
        "truncation_note": if truncated { Some(format!("Showing {limit} of {} records.", filtered.len())) } else { None },
        "records": filtered.into_iter().take(limit).collect::<Vec<_>>(),
    }))
}

fn tally_conversion(statuses: impl Iterator<Item = String>) -> (usize, usize, usize, usize, usize) {
    let mut total = 0usize;
    let mut converted = 0usize;
    let mut not_converted = 0usize;
    let mut closed = 0usize;
    for s in statuses {
        total += 1;
        let lower = s.to_lowercase();
        if lower.contains("converted") {
            converted += 1;
        } else if lower.contains("closed") || lower.contains("dropped") {
            closed += 1;
        } else {
            not_converted += 1;
        }
    }
    let denom = total.saturating_sub(closed);
    (total, converted, not_converted, closed, denom)
}

pub fn get_analytics(
    records: Vec<HashMap<String, String>>,
    role: Option<&str>,
    user_name: Option<&str>,
    args: &Value,
    poc_profiles: &[Value],
) -> Result<Value, String> {
    let allowed = &[
        "metric",
        "domain",
        "poc",
        "scope_org_wide",
        "query",
        "sources",
        "limit",
    ];
    if let Some(err) = reject_unknown_params(args, allowed) {
        return Err(err);
    }
    let metric = args
        .get("metric")
        .and_then(Value::as_str)
        .ok_or_else(|| "metric is required".to_string())?;
    if !ALLOWED_ANALYTICS_METRICS.contains(&metric) {
        return Err(format!("Unknown metric: {metric}"));
    }
    let mut filtered = apply_poc_read_scope(records, role, user_name, args);
    if let Some(domain) = args.get("domain").and_then(Value::as_str) {
        filtered.retain(|r| matches_filter(r.get("Domain").map(String::as_str).unwrap_or(""), domain));
    }
    if let Some(poc) = args.get("poc").and_then(Value::as_str) {
        filtered.retain(|r| {
            matches_poc_filter(r.get("Prep POC").map(String::as_str).unwrap_or(""), poc)
                || matches_poc_filter(r.get("Outreach POC").map(String::as_str).unwrap_or(""), poc)
        });
    }
    match metric {
        "status_distribution" => {
            let mut dist: HashMap<String, usize> = HashMap::new();
            for r in &filtered {
                let s = r.get("Status").cloned().unwrap_or_else(|| "Unknown".into());
                *dist.entry(s).or_default() += 1;
            }
            Ok(json!({ "total": filtered.len(), "distribution": dist }))
        }
        "domain_distribution" => {
            let mut dist: HashMap<String, usize> = HashMap::new();
            for r in &filtered {
                let d = r.get("Domain").cloned().unwrap_or_else(|| "Unknown".into());
                *dist.entry(d).or_default() += 1;
            }
            Ok(json!({ "total": filtered.len(), "distribution": dist }))
        }
        "poc_workload" => {
            let mut poc_map: HashMap<String, (usize, usize, usize, HashSet<String>)> = HashMap::new();
            for r in &filtered {
                for col in ["Prep POC", "Outreach POC"] {
                    let poc = r.get(col).cloned().unwrap_or_default();
                    if poc.is_empty() {
                        continue;
                    }
                    let entry = poc_map.entry(poc).or_default();
                    entry.0 += 1;
                    let status = r.get("Status").map(String::as_str).unwrap_or("").to_lowercase();
                    if status == "ongoing" {
                        entry.1 += 1;
                    }
                    if status == "converted" {
                        entry.2 += 1;
                    }
                    if let Some(domain) = r.get("Domain") {
                        entry.3.insert(domain.clone());
                    }
                }
            }
            for p in poc_profiles {
                if let Some(name) = p.get("name").and_then(Value::as_str) {
                    poc_map.entry(name.to_string()).or_default();
                    if let Some(domain) = p.get("primary_domain").and_then(Value::as_str) {
                        poc_map.get_mut(name).unwrap().3.insert(domain.to_string());
                    }
                }
            }
            let mut workload: Vec<Value> = poc_map
                .into_iter()
                .map(|(name, (total, ongoing, converted, domains))| {
                    json!({
                        "name": name,
                        "total": total,
                        "ongoing": ongoing,
                        "converted": converted,
                        "domains": domains.into_iter().collect::<Vec<_>>(),
                    })
                })
                .collect();
            workload.sort_by(|a, b| {
                b.get("total")
                    .and_then(Value::as_u64)
                    .unwrap_or(0)
                    .cmp(&a.get("total").and_then(Value::as_u64).unwrap_or(0))
            });
            Ok(json!({
                "total_pocs": workload.len(),
                "pocs": workload,
                "note": format!("{} POCs total (including those with 0 active LMPs)", workload.len()),
            }))
        }
        "conversion_rate" => {
            let (total, converted, not_converted, closed, denom) =
                tally_conversion(filtered.iter().map(|r| r.get("Status").cloned().unwrap_or_default()));
            let rate = if denom == 0 {
                "0%".to_string()
            } else {
                format!("{:.1}%", (converted as f64 / denom as f64) * 100.0)
            };
            Ok(json!({
                "total": total,
                "converted": converted,
                "not_converted": not_converted,
                "closed": closed,
                "eligible_denominator": denom,
                "conversion_rate": rate,
                "formula": "Converted ÷ (Total − closed)",
            }))
        }
        "type_distribution" => {
            let mut dist: HashMap<String, usize> = HashMap::new();
            for r in &filtered {
                let t = r.get("Type").cloned().unwrap_or_else(|| "Unknown".into());
                *dist.entry(t).or_default() += 1;
            }
            Ok(json!({ "total": filtered.len(), "distribution": dist }))
        }
        "age_tracking" => {
            let now = chrono::Utc::now().timestamp();
            let mut ages: Vec<Value> = filtered
                .iter()
                .map(|r| {
                    let days = r
                        .get("Date")
                        .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
                        .map(|d| ((now - d.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp()) / 86400).max(0))
                        .unwrap_or(0);
                    json!({
                        "company": r.get("Company"),
                        "role": r.get("Role"),
                        "status": r.get("Status"),
                        "age_days": days,
                    })
                })
                .collect();
            ages.sort_by(|a, b| {
                b.get("age_days")
                    .and_then(Value::as_i64)
                    .unwrap_or(0)
                    .cmp(&a.get("age_days").and_then(Value::as_i64).unwrap_or(0))
            });
            Ok(json!({ "records": ages.into_iter().take(30).collect::<Vec<_>>() }))
        }
        "overview" | "pipeline_summary" => {
            let (total, converted, not_converted, closed, denom) =
                tally_conversion(filtered.iter().map(|r| r.get("Status").cloned().unwrap_or_default()));
            let rate = if denom == 0 {
                "0%".to_string()
            } else {
                format!("{:.1}%", (converted as f64 / denom as f64) * 100.0)
            };
            let mut status_dist: HashMap<String, usize> = HashMap::new();
            let mut domain_dist: HashMap<String, usize> = HashMap::new();
            for r in &filtered {
                *status_dist
                    .entry(r.get("Status").cloned().unwrap_or_else(|| "Unknown".into()))
                    .or_default() += 1;
                *domain_dist
                    .entry(r.get("Domain").cloned().unwrap_or_else(|| "Unknown".into()))
                    .or_default() += 1;
            }
            Ok(json!({
                "total": total,
                "converted": converted,
                "not_converted": not_converted,
                "closed": closed,
                "eligible_denominator": denom,
                "conversion_rate": rate,
                "formula": "Converted ÷ (Total − closed)",
                "status_distribution": status_dist,
                "domain_distribution": domain_dist,
            }))
        }
        _ => Err(format!("Unsupported metric: {metric}")),
    }
}

pub fn format_query_sse(template: &str, result: &Value) -> String {
    match template {
        "search_lmp_records" => {
            let count = result.get("returned_count").and_then(Value::as_u64).unwrap_or(0);
            let records = result.get("records").cloned().unwrap_or_else(|| json!([]));
            let preview: Vec<Value> = records
                .as_array()
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .take(8)
                .map(|r| {
                    json!({
                        "company": r.get("Company"),
                        "role": r.get("Role"),
                        "status": r.get("Status"),
                        "domain": r.get("Domain"),
                        "prep_poc": r.get("Prep POC"),
                    })
                })
                .collect();
            format!(
                "Found {count} matching LMP process(es).\n\n:::blocks\n{}\n:::",
                json!([{
                    "type": "table",
                    "title": "LMP processes",
                    "columns": ["Company", "Role", "Status", "Domain", "Prep POC"],
                    "rows": preview.iter().map(|r| vec![
                        r.get("company").and_then(Value::as_str).unwrap_or("").to_string(),
                        r.get("role").and_then(Value::as_str).unwrap_or("").to_string(),
                        r.get("status").and_then(Value::as_str).unwrap_or("").to_string(),
                        r.get("domain").and_then(Value::as_str).unwrap_or("").to_string(),
                        r.get("prep_poc").and_then(Value::as_str).unwrap_or("").to_string(),
                    ]).collect::<Vec<_>>(),
                }])
            )
        }
        "get_analytics" if result.get("pocs").is_some() => {
            format!(
                "POC workload breakdown across {} POCs.\n\n:::blocks\n{}\n:::",
                result.get("total_pocs").and_then(Value::as_u64).unwrap_or(0),
                json!([{
                    "type": "pipeline-card",
                    "title": "POC workload",
                    "stages": result.get("pocs").and_then(|p| p.as_array()).cloned().unwrap_or_default()
                        .into_iter().take(6).map(|p| json!({
                            "label": p.get("name"),
                            "count": p.get("total"),
                            "detail": format!("ongoing {} · converted {}",
                                p.get("ongoing").and_then(Value::as_u64).unwrap_or(0),
                                p.get("converted").and_then(Value::as_u64).unwrap_or(0)),
                        })).collect::<Vec<_>>(),
                }])
            )
        }
        "get_analytics" => format!(
            "Analytics result ready.\n\n:::blocks\n{}\n:::",
            json!([{ "type": "json-card", "title": "Analytics", "data": result }])
        ),
        _ => format!("Query `{template}` completed.\n\n{result}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn sample_records() -> Vec<HashMap<String, String>> {
        vec![
            HashMap::from([
                ("Company".into(), "Acme".into()),
                ("Role".into(), "PM".into()),
                ("Status".into(), "Ongoing".into()),
                ("Domain".into(), "Product".into()),
                ("Prep POC".into(), "Sam".into()),
                ("Outreach POC".into(), "".into()),
                ("Support POC".into(), "".into()),
                ("Secondary POC".into(), "".into()),
                ("Type".into(), "Full-time".into()),
                ("Date".into(), "2026-01-01".into()),
                ("Last Updated".into(), "2026-06-01T00:00:00Z".into()),
            ]),
            HashMap::from([
                ("Company".into(), "Beta".into()),
                ("Role".into(), "Analyst".into()),
                ("Status".into(), "Converted".into()),
                ("Domain".into(), "Finance".into()),
                ("Prep POC".into(), "Alex".into()),
                ("Outreach POC".into(), "".into()),
                ("Support POC".into(), "".into()),
                ("Secondary POC".into(), "".into()),
                ("Type".into(), "Intern".into()),
                ("Date".into(), "2026-02-01".into()),
                ("Last Updated".into(), "2026-06-02T00:00:00Z".into()),
            ]),
        ]
    }

    #[test]
    fn search_lmp_records_filters_company() {
        let result = search_lmp_records(
            sample_records(),
            Some("admin"),
            Some("Admin"),
            &json!({ "company": "Acme", "limit": 10 }),
        )
        .unwrap();
        assert_eq!(result.get("returned_count").and_then(Value::as_u64), Some(1));
    }

    #[test]
    fn poc_role_scoped_search() {
        let result = search_lmp_records(
            sample_records(),
            Some("poc"),
            Some("Sam"),
            &json!({ "limit": 10 }),
        )
        .unwrap();
        assert_eq!(result.get("returned_count").and_then(Value::as_u64), Some(1));
    }

    #[test]
    fn rejects_unknown_search_param() {
        let err = search_lmp_records(
            sample_records(),
            Some("admin"),
            Some("Admin"),
            &json!({ "sql": "drop table" }),
        )
        .unwrap_err();
        assert!(err.contains("Unknown parameter"));
    }

    #[test]
    fn poc_workload_metric() {
        let result = get_analytics(
            sample_records(),
            Some("admin"),
            Some("Admin"),
            &json!({ "metric": "poc_workload" }),
            &[],
        )
        .unwrap();
        assert!(result.get("pocs").and_then(Value::as_array).map(|a| !a.is_empty()) == Some(true));
    }
}
