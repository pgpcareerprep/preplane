#[derive(Clone, Debug)]
pub struct Config {
    pub supabase_url: String,
    pub supabase_anon_key: String,
    pub supabase_service_role_key: String,
    pub intent_router_url: Option<String>,
    pub query_path_url: Option<String>,
    pub command_path_url: Option<String>,
    pub reasoning_url: Option<String>,
    pub workflow_url: Option<String>,
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
        let intent_router_url = std::env::var("INTENT_ROUTER_URL").ok();
        let query_path_url = std::env::var("QUERY_PATH_URL").ok();
        let command_path_url = std::env::var("COMMAND_PATH_URL").ok();
        let reasoning_url = std::env::var("REASONING_URL").ok();
        let workflow_url = std::env::var("WORKFLOW_URL").ok();
        Self {
            supabase_url: supabase_url.trim_end_matches('/').to_string(),
            supabase_anon_key,
            supabase_service_role_key,
            intent_router_url,
            query_path_url,
            command_path_url,
            reasoning_url,
            workflow_url,
        }
    }
}
