#[derive(Debug, Clone, Default)]
pub struct RouterContext {
    pub role: String,
    pub real_role: String,
    pub view_as_role: Option<String>,
    pub view_as_user_name: Option<String>,
    pub lmp_id: Option<String>,
    pub mode: String,
    pub history_len: usize,
}

impl RouterContext {
    pub fn is_view_as(&self) -> bool {
        let view_name = self.view_as_user_name.as_deref().unwrap_or("").trim();
        !view_name.is_empty()
    }

    pub fn effective_role(&self) -> &str {
        self.view_as_role
            .as_deref()
            .filter(|r| !r.is_empty())
            .unwrap_or(self.role.as_str())
    }
}
