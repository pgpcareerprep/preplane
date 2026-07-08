pub mod api;
pub mod arbitration;
pub mod category;
pub mod context;
pub mod router;
pub mod rules;
pub mod semantic;
pub mod similarity;

pub use router::{classify, classify_sync};
pub use rules::CopilotSubIntent;
