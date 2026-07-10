use crate::scope::{apply_poc_read_scope, matches_filter, matches_poc_filter, record_matches_operational_poc_scope};
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

pub fn lmp_with_alumni_mentors(rows: Vec<Value>, args: &Value) -> Result<Value, String> {
    if let Some(err) = reject_unknown_params(args, &["limit"]) {
        return Err(err);
    }
    let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(50) as usize;
    let mut seen = HashSet::new();
    let mut records: Vec<Value> = Vec::new();
    for row in rows {
        let mentor = row.get("mentors");
        let source = mentor
            .and_then(|m| m.get("source"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_uppercase();
        let sync = mentor
            .and_then(|m| m.get("sync_source"))
            .and_then(Value::as_str)
            .unwrap_or("");
        if source != "ALU" && sync != "alumni_mirror" {
            continue;
        }
        let lmp_id = row
            .get("lmp_id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        if lmp_id.is_empty() || seen.contains(&lmp_id) {
            continue;
        }
        seen.insert(lmp_id);
        let proc = row.get("lmp_processes");
        records.push(json!({
            "company": proc.and_then(|p| p.get("company")).and_then(Value::as_str).unwrap_or(""),
            "role": proc.and_then(|p| p.get("role")).and_then(Value::as_str).unwrap_or(""),
            "status": proc.and_then(|p| p.get("status")).and_then(Value::as_str).unwrap_or(""),
            "domain": proc.and_then(|p| p.get("domain_raw")).and_then(Value::as_str).unwrap_or(""),
            "mentor": mentor.and_then(|m| m.get("name")).and_then(Value::as_str).unwrap_or(""),
            "source": "ALU",
        }));
    }
    let total = records.len();
    let truncated = total > limit;
    let preview: Vec<_> = records.into_iter().take(limit).collect();
    Ok(json!({
        "total_count": total,
        "returned_count": preview.len(),
        "truncated": truncated,
        "records": preview,
    }))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StatusBucket {
    NotStarted,
    PrepOngoing,
    PrepDone,
    OnHold,
    Converted,
    NotConverted,
    OtherReasons,
    Unknown,
}

fn map_status_bucket(raw: &str) -> StatusBucket {
    let s = raw.trim().to_lowercase();
    match s.as_str() {
        "not-started" => StatusBucket::NotStarted,
        "prep-ongoing" | "ongoing" => StatusBucket::PrepOngoing,
        "prep-done" => StatusBucket::PrepDone,
        "hold" => StatusBucket::OnHold,
        "converted" | "offer-received" => StatusBucket::Converted,
        "not-converted" | "not converted" => StatusBucket::NotConverted,
        "other-reasons" | "dormant" | "closed" | "converted-na" => StatusBucket::OtherReasons,
        _ => StatusBucket::Unknown,
    }
}

struct ConversionSummary {
    total: usize,
    converted: usize,
    not_converted_closed: usize,
    closed_other: usize,
    in_pipeline: usize,
    lmp_process_denom: usize,
    poc_performance_denom: usize,
    lmp_process_pct: Option<f64>,
    poc_performance_pct: Option<f64>,
}

fn pct(n: usize, d: usize) -> Option<f64> {
    if d == 0 {
        None
    } else {
        Some(((n as f64 / d as f64) * 1000.0).round() / 10.0)
    }
}

fn tally_conversion(statuses: impl Iterator<Item = String>) -> ConversionSummary {
    let mut total = 0usize;
    let mut converted = 0usize;
    let mut not_converted_closed = 0usize;
    let mut closed_other = 0usize;
    let mut in_pipeline = 0usize;
    for s in statuses {
        total += 1;
        match map_status_bucket(&s) {
            StatusBucket::Converted => converted += 1,
            StatusBucket::NotConverted => not_converted_closed += 1,
            StatusBucket::OtherReasons => closed_other += 1,
            StatusBucket::NotStarted
            | StatusBucket::PrepOngoing
            | StatusBucket::PrepDone
            | StatusBucket::OnHold
            | StatusBucket::Unknown => in_pipeline += 1,
        }
    }
    let lmp_process_denom = total.saturating_sub(closed_other);
    let poc_performance_denom = converted + not_converted_closed;
    ConversionSummary {
        total,
        converted,
        not_converted_closed,
        closed_other,
        in_pipeline,
        lmp_process_denom,
        poc_performance_denom,
        lmp_process_pct: pct(converted, lmp_process_denom),
        poc_performance_pct: pct(converted, poc_performance_denom),
    }
}

fn conversion_metrics_json(summary: &ConversionSummary, poc_label: Option<&str>) -> Value {
    json!({
        "scope_label": poc_label,
        "total_lmps": summary.total,
        "converted": summary.converted,
        "not_converted_closed_outcome": summary.not_converted_closed,
        "in_pipeline": summary.in_pipeline,
        "closed_other_reasons": summary.closed_other,
        "poc_performance_conversion_pct": summary.poc_performance_pct,
        "poc_performance_conversion_rate": match summary.poc_performance_pct {
            Some(p) => format!("{}/{} - {}%", summary.converted, summary.poc_performance_denom, p),
            None => "—".to_string(),
        },
        "lmp_process_conversion_pct": summary.lmp_process_pct,
        "lmp_process_conversion_rate": match summary.lmp_process_pct {
            Some(p) => format!("{}/{} - {}%", summary.converted, summary.lmp_process_denom, p),
            None => "—".to_string(),
        },
        "kpi_labeling": {
            "converted": "Converted",
            "not_converted_closed_outcome": "Not converted (closed outcome)",
            "in_pipeline": "In pipeline",
            "closed_other_reasons": "Closed — other reasons (excluded from denominators)",
            "do_not_compute": "Never set not_converted = total − converted. Use not_converted_closed_outcome and in_pipeline.",
        },
    })
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
        filtered.retain(|r| record_matches_operational_poc_scope(r, poc));
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
            let summary = tally_conversion(
                filtered
                    .iter()
                    .map(|r| r.get("Status").cloned().unwrap_or_default()),
            );
            let poc_label = args.get("poc").and_then(Value::as_str);
            Ok(conversion_metrics_json(&summary, poc_label))
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
            let summary = tally_conversion(
                filtered
                    .iter()
                    .map(|r| r.get("Status").cloned().unwrap_or_default()),
            );
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
            let poc_label = args.get("poc").and_then(Value::as_str);
            let mut payload = conversion_metrics_json(&summary, poc_label);
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("status_distribution".into(), json!(status_dist));
                obj.insert("domain_distribution".into(), json!(domain_dist));
            }
            Ok(payload)
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
        "get_analytics" if result.get("not_converted_closed_outcome").is_some()
            || result.get("poc_performance_conversion_rate").is_some() =>
        {
            let rate = result
                .get("poc_performance_conversion_rate")
                .and_then(Value::as_str)
                .or_else(|| result.get("lmp_process_conversion_rate").and_then(Value::as_str))
                .unwrap_or("—");
            format!(
                "Conversion metrics ready ({rate}).\n\n:::blocks\n{}\n:::",
                json!([{
                    "type": "kpi-row",
                    "items": [
                        { "label": "Converted", "value": result.get("converted").unwrap_or(&json!(0)), "color": "green" },
                        { "label": "Not converted (closed outcome)", "value": result.get("not_converted_closed_outcome").unwrap_or(&json!(0)), "color": "red" },
                        { "label": "In pipeline", "value": result.get("in_pipeline").unwrap_or(&json!(0)), "color": "orange" },
                        { "label": "POC performance", "value": rate, "color": "green" },
                    ]
                }])
            )
        }
        "get_analytics" if result.get("records").is_some() => {
            let records = result.get("records").and_then(Value::as_array).cloned().unwrap_or_default();
            let rows: Vec<Vec<String>> = records
                .iter()
                .take(15)
                .map(|r| {
                    vec![
                        r.get("company").and_then(Value::as_str).unwrap_or("").to_string(),
                        r.get("role").and_then(Value::as_str).unwrap_or("").to_string(),
                        r.get("status").and_then(Value::as_str).unwrap_or("").to_string(),
                        r.get("age_days").map(|v| v.to_string()).unwrap_or_default(),
                    ]
                })
                .collect();
            format!(
                "Oldest / attention LMPs (by age).\n\n:::blocks\n{}\n:::",
                json!([{
                    "type": "table",
                    "title": "Age tracking",
                    "columns": ["Company", "Role", "Status", "Age (days)"],
                    "rows": rows,
                }])
            )
        }
        "get_analytics" => format!(
            "Analytics result ready.\n\n:::blocks\n{}\n:::",
            json!([{ "type": "json-card", "title": "Analytics", "data": result }])
        ),
        "lmp_with_alumni_mentors" => {
            let count = result.get("returned_count").and_then(Value::as_u64).unwrap_or(0);
            let total = result.get("total_count").and_then(Value::as_u64).unwrap_or(count);
            let records = result.get("records").cloned().unwrap_or_else(|| json!([]));
            let rows: Vec<Vec<String>> = records
                .as_array()
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .map(|r| {
                    vec![
                        r.get("company").and_then(Value::as_str).unwrap_or("").to_string(),
                        r.get("role").and_then(Value::as_str).unwrap_or("").to_string(),
                        r.get("status").and_then(Value::as_str).unwrap_or("").to_string(),
                        r.get("domain").and_then(Value::as_str).unwrap_or("").to_string(),
                        r.get("mentor").and_then(Value::as_str).unwrap_or("").to_string(),
                        r.get("source").and_then(Value::as_str).unwrap_or("ALU").to_string(),
                    ]
                })
                .collect();
            format!(
                "Found {total} LMP process(es) with alumni (ALU) mentors aligned.\n\n:::blocks\n{}\n:::",
                json!([{
                    "type": "table",
                    "title": "LMPs with alumni mentors",
                    "columns": ["Company", "Role", "Status", "Domain", "Mentor", "Source"],
                    "rows": rows,
                }])
            )
        }
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

    #[test]
    fn conversion_rate_distinguishes_not_converted_from_converted() {
        let records = vec![
            HashMap::from([
                ("Status".into(), "Converted".into()),
                ("Prep POC".into(), "Radhika".into()),
                ("Support POC".into(), "".into()),
                ("Secondary POC".into(), "".into()),
            ]),
            HashMap::from([
                ("Status".into(), "Not Converted".into()),
                ("Prep POC".into(), "Radhika".into()),
                ("Support POC".into(), "".into()),
                ("Secondary POC".into(), "".into()),
            ]),
            HashMap::from([
                ("Status".into(), "Prep-Ongoing".into()),
                ("Prep POC".into(), "Radhika".into()),
                ("Support POC".into(), "".into()),
                ("Secondary POC".into(), "".into()),
            ]),
        ];
        let result = get_analytics(
            records,
            Some("admin"),
            Some("Admin"),
            &json!({ "metric": "conversion_rate", "poc": "Radhika" }),
            &[],
        )
        .unwrap();
        assert_eq!(result.get("converted").and_then(Value::as_u64), Some(1));
        assert_eq!(
            result.get("not_converted_closed_outcome").and_then(Value::as_u64),
            Some(1)
        );
        assert_eq!(result.get("in_pipeline").and_then(Value::as_u64), Some(1));
        assert_eq!(result.get("poc_performance_conversion_pct").and_then(Value::as_f64), Some(50.0));
    }
}
