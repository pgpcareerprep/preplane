use crate::supabase::SupabaseClient;
use chrono::Utc;
use serde_json::{json, Value};
use std::collections::HashMap;

pub struct MirrorResult {
    pub ok: bool,
    pub skipped: bool,
    pub error: Option<String>,
}

pub async fn mirror_lmp_upsert(sb: &SupabaseClient, payload: &Value) -> MirrorResult {
    let company = payload.get("company").and_then(Value::as_str).unwrap_or("").trim();
    let role = payload.get("role").and_then(Value::as_str).unwrap_or("").trim();
    if company.is_empty() || role.is_empty() {
        return MirrorResult {
            ok: false,
            skipped: false,
            error: Some("Missing company or role".into()),
        };
    }
    let mut update = json!({ "updated_at": Utc::now().to_rfc3339() });
    if let Some(obj) = payload.as_object() {
        for (k, v) in obj {
            if k == "company" || k == "role" {
                continue;
            }
            if !v.is_null() {
                if let Some(s) = v.as_str() {
                    if s.is_empty() {
                        continue;
                    }
                }
                update[k] = v.clone();
            }
        }
    }
    let lookup_url = format!(
        "{}/rest/v1/lmp_processes?select=id&company=ilike.{}&role=ilike.{}&limit=1",
        sb.base_url,
        encode(company),
        encode(role),
    );
    let lookup = sb
        .auth_headers(sb.http.get(&lookup_url))
        .send()
        .await;
    let Ok(resp) = lookup else {
        return MirrorResult {
            ok: false,
            skipped: false,
            error: Some("Lookup failed".into()),
        };
    };
    let Ok(rows) = resp.json::<Vec<Value>>().await else {
        return MirrorResult {
            ok: false,
            skipped: false,
            error: Some("Lookup parse failed".into()),
        };
    };
    if let Some(existing) = rows.first().and_then(|r| r.get("id")).and_then(Value::as_str) {
        let patch_url = format!("{}/rest/v1/lmp_processes?id=eq.{}", sb.base_url, existing);
        let patch = sb
            .auth_headers(sb.http.patch(&patch_url))
            .json(&update)
            .send()
            .await;
        return match patch {
            Ok(r) if r.status().is_success() => MirrorResult {
                ok: true,
                skipped: false,
                error: None,
            },
            Ok(r) => MirrorResult {
                ok: false,
                skipped: false,
                error: Some(format!("Update failed: {}", r.status())),
            },
            Err(e) => MirrorResult {
                ok: false,
                skipped: false,
                error: Some(e.to_string()),
            },
        };
    }
    let mut insert = update;
    insert["company"] = json!(company);
    insert["role"] = json!(role);
    insert["sync_source"] = json!("copilot");
    if insert.get("status").is_none() {
        insert["status"] = json!("Ongoing");
    }
    let post_url = format!("{}/rest/v1/lmp_processes", sb.base_url);
    let post = sb
        .auth_headers(sb.http.post(&post_url))
        .json(&insert)
        .send()
        .await;
    match post {
        Ok(r) if r.status().is_success() => MirrorResult {
            ok: true,
            skipped: false,
            error: None,
        },
        Ok(r) => MirrorResult {
            ok: false,
            skipped: false,
            error: Some(format!("Insert failed: {}", r.status())),
        },
        Err(e) => MirrorResult {
            ok: false,
            skipped: false,
            error: Some(e.to_string()),
        },
    }
}

pub async fn mirror_lmp_fields(
    sb: &SupabaseClient,
    company: &str,
    role: &str,
    sheet_fields: &serde_json::Map<String, Value>,
) -> MirrorResult {
    let mut db_fields = HashMap::new();
    for (raw_col, value) in sheet_fields {
        let sheet_col = sheet_field_alias(raw_col.trim());
        if let Some(db_col) = mirror_field_map().get(sheet_col) {
            db_fields.insert(db_col.to_string(), value_to_string(value));
        }
    }
    if db_fields.is_empty() {
        return MirrorResult {
            ok: false,
            skipped: true,
            error: Some("No recognized LMP fields in update payload.".into()),
        };
    }
    let mut payload = json!({ "company": company, "role": role });
    for (k, v) in db_fields {
        payload[k] = json!(v);
    }
    mirror_lmp_upsert(sb, &payload).await
}

fn value_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        _ => v.to_string(),
    }
}

fn sheet_field_alias(col: &str) -> &str {
    match col {
        "R1 Shortlisted" | "R1 Names" => "R1 - Names",
        "R2 Shortlisted" | "R2 Names" => "R2 - Names",
        "R3 Shortlisted" | "R3 Names" => "R3 - Names",
        other => other,
    }
}

fn mirror_field_map() -> HashMap<&'static str, &'static str> {
    HashMap::from([
        ("Status", "status"),
        ("Type", "type"),
        ("Domain", "domain_raw"),
        ("Prep POC", "prep_poc"),
        ("POC", "prep_poc"),
        ("Outreach POC", "outreach_poc"),
        ("Secondary POC", "support_poc"),
        ("Support POC", "support_poc"),
        ("Daily Progress", "daily_progress"),
        ("Prep Progress", "prep_progress"),
        ("Placement Progress", "placement_progress"),
        ("Remarks", "remarks"),
        ("Closing Date", "closing_date"),
        ("Mentor Aligned", "mentor_aligned"),
        ("Prep Doc", "prep_doc"),
        ("R1 - Names", "r1_names"),
        ("R2 - Names", "r2_names"),
        ("R3 - Names", "r3_names"),
        ("Final Converted Numbers", "final_converted_numbers"),
        ("Converted Names", "final_converted_names"),
        ("Final Convert", "final_converted_numbers"),
        ("Convert Name(s)", "final_converted_names"),
        // snake_case tool payloads
        ("status", "status"),
        ("daily_progress", "daily_progress"),
        ("prep_progress", "prep_progress"),
        ("placement_progress", "placement_progress"),
        ("remarks", "remarks"),
        ("mentor_aligned", "mentor_aligned"),
        ("r1_names", "r1_names"),
        ("r2_names", "r2_names"),
        ("r3_names", "r3_names"),
        ("final_converted_names", "final_converted_names"),
    ])
}

fn encode(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            ' ' => "%20".into(),
            _ => format!("%{:02X}", c as u32),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aliases_round_names() {
        assert_eq!(sheet_field_alias("R1 Names"), "R1 - Names");
    }
}
