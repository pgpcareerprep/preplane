# Deprecated — Phase 9 cutover

Traffic for `/copilot` now routes to the Rust gateway (`preplane-copilot.onrender.com`) by default in production builds.

This edge function remains deployed for:
- Instant rollback (`VITE_COPILOT_USE_LEGACY=1` on Cloudflare Pages)
- LLM multi-tool orchestration not yet ported to the hybrid backend

Do not add new features here. Port changes to `services/gateway` and path services.
