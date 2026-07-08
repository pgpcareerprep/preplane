#[derive(Clone, Debug)]
pub struct Config {
    pub supabase_url: String,
    pub supabase_anon_key: String,
    pub supabase_service_role_key: String,
}

impl Config {
    pub fn from_env() -> Self {
        let supabase_url = std::env::var("SUPABASE_URL")
            .or_else(|_| std::env::var("VITE_SUPABASE_URL"))
            .expect("SUPABASE_URL required");
        let supabase_anon_key = std::env::var("SUPABASE_ANON_KEY")
            .or_else(|_| std::env::var("SUPABASE_PUBLISHABLE_KEY"))
            .or_else(|_| std::env::var("VITE_SUPABASE_PUBLISHABLE_KEY"))
            .expect("SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY required");
        let supabase_service_role_key =
            std::env::var("SUPABASE_SERVICE_ROLE_KEY").expect("SUPABASE_SERVICE_ROLE_KEY required");
        Self {
            supabase_url: supabase_url.trim_end_matches('/').to_string(),
            supabase_anon_key,
            supabase_service_role_key,
        }
    }
}
