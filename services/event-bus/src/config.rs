#[derive(Clone, Debug)]
pub struct Config {
    pub redis_url: Option<String>,
    pub stream_name: String,
    pub poll_ms: u64,
    pub batch_size: usize,
}

impl Config {
    pub fn from_env() -> Self {
        let redis_url = std::env::var("REDIS_URL").ok().filter(|s| !s.trim().is_empty());
        let stream_name = std::env::var("EVENT_BUS_STREAM")
            .unwrap_or_else(|_| crate::DEFAULT_STREAM.into());
        let poll_ms = std::env::var("EVENT_BUS_POLL_MS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(2000);
        let batch_size = std::env::var("EVENT_BUS_BATCH_SIZE")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(25);
        Self {
            redis_url,
            stream_name,
            poll_ms,
            batch_size,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_stream_name() {
        let cfg = Config {
            redis_url: None,
            stream_name: crate::DEFAULT_STREAM.into(),
            poll_ms: 2000,
            batch_size: 25,
        };
        assert_eq!(cfg.stream_name, "preplane:events");
    }
}
