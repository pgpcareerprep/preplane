use serde_json::Value;
use std::collections::HashMap;

pub fn db_lmp_row_to_record(row: &Value) -> HashMap<String, String> {
    let v = |key: &str| {
        row.get(key)
            .map(|x| match x {
                Value::Null => String::new(),
                Value::Bool(b) => b.to_string(),
                Value::Number(n) => n.to_string(),
                Value::String(s) => s.clone(),
                _ => x.to_string(),
            })
            .unwrap_or_default()
    };
    HashMap::from([
        ("Company".into(), v("company")),
        ("Role".into(), v("role")),
        ("Domain".into(), v("domain_raw")),
        ("Status".into(), v("status")),
        ("Type".into(), v("type")),
        ("Date".into(), v("date")),
        ("Closing Date".into(), v("closing_date")),
        ("Prep POC".into(), v("prep_poc")),
        ("Support POC".into(), v("support_poc")),
        ("Outreach POC".into(), v("outreach_poc")),
        ("Secondary POC".into(), v("support_poc")),
        ("Mentor Aligned".into(), v("mentor_aligned")),
        ("Daily Progress".into(), v("daily_progress")),
        ("Final Converted Numbers".into(), v("final_converted_numbers")),
        ("Last Updated".into(), v("updated_at")),
        ("id".into(), v("id")),
    ])
}

pub async fn fetch_lmp_records(
    supabase_url: &str,
    service_key: &str,
) -> Result<Vec<HashMap<String, String>>, String> {
    let url = format!(
        "{}/rest/v1/lmp_processes?select=id,company,role,domain_raw,status,type,date,prep_poc,support_poc,outreach_poc,mentor_aligned,daily_progress,final_converted_numbers,updated_at,closing_date&limit=2000",
        supabase_url.trim_end_matches('/')
    );
    let client = reqwest::Client::new();
    let resp = client
        .get(url)
        .header("apikey", service_key)
        .header("Authorization", format!("Bearer {service_key}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("lmp_processes fetch failed: {}", resp.status()));
    }
    let rows: Vec<Value> = resp.json().await.map_err(|e| e.to_string())?;
    Ok(rows.iter().map(db_lmp_row_to_record).collect())
}

pub async fn fetch_poc_profiles(
    supabase_url: &str,
    service_key: &str,
) -> Result<Vec<Value>, String> {
    let url = format!(
        "{}/rest/v1/poc_profiles?select=name,role_type,primary_domain,active_load,conversion_rate&order=name",
        supabase_url.trim_end_matches('/')
    );
    let client = reqwest::Client::new();
    let resp = client
        .get(url)
        .header("apikey", service_key)
        .header("Authorization", format!("Bearer {service_key}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Ok(vec![]);
    }
    resp.json().await.map_err(|e| e.to_string())
}
