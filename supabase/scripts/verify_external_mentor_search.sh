#!/usr/bin/env bash
# Phase 0 — verify Gemini key locally and Supabase secret digests (no full keys printed).
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-sgqwnjajvgjcwqergnsr}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "=== Supabase secrets (digests only) ==="
if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  npx supabase secrets list --project-ref "$PROJECT_REF" || {
    echo "Could not list secrets. Run: npx supabase login"
    echo "Then: npx supabase secrets list --project-ref $PROJECT_REF"
  }
else
  echo "Skipped (no SUPABASE_ACCESS_TOKEN). Run: npx supabase login"
  echo "Then: npx supabase secrets list --project-ref $PROJECT_REF"
fi

echo ""
echo "=== Gemini API (local GEMINI_API_KEY) ==="
if [[ -n "${GEMINI_API_KEY:-}" ]]; then
  curl -sS \
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"contents":[{"parts":[{"text":"ping"}]}]}' \
    | head -c 600
  echo ""
else
  echo "Set GEMINI_API_KEY in your shell to run the curl test."
fi

echo ""
echo "=== Jina API (local JINA_API_KEY) ==="
if [[ -n "${JINA_API_KEY:-}" ]]; then
  curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
    -H "Authorization: Bearer ${JINA_API_KEY}" \
    -H "Accept: application/json" \
    "https://s.jina.ai/mentor%20coach"
  if [[ "${SET_JINA_IN_SUPABASE:-}" == "1" ]]; then
    echo "Setting JINA_API_KEY in Supabase (from env)..."
    npx supabase secrets set "JINA_API_KEY=${JINA_API_KEY}" --project-ref "$PROJECT_REF"
  fi
else
  echo "Set JINA_API_KEY to test Jina. To push to Supabase: SET_JINA_IN_SUPABASE=1 JINA_API_KEY=... $0"
fi

echo ""
echo "=== Edge function diag (requires logged-in app session or service role) ==="
echo "From the app (admin/allocator): Mentors tab → Diagnose external search"
echo "Or invoke external-mentor-search with body: { \"diag\": true }"
