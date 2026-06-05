import { useEffect, useMemo, useState } from "react";
import { Brain, RefreshCcw, Search, Loader2, Gauge, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRole } from "@/lib/rolesContext";
import { useAiUsage } from "@/hooks/useAiUsage";

const TABLES = [
  "lmp_processes",
  "students",
  "poc_profiles",
  "mentors",
  "alumni_records",
  "domains",
  "lmp_daily_logs",
  "lmp_comments",
  "lmp_timeline",
  "lmp_checklists",
  "lmp_candidates",
  "sessions",
  "activity_log",
  "copilot_messages",
] as const;

type Stats = Record<string, { count: number; last_embedded_at: string | null }>;
type SearchResult = {
  id: string;
  source_table: string;
  source_id: string;
  content: string;
  similarity: number;
};

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr${h > 1 ? "s" : ""} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d > 1 ? "s" : ""} ago`;
}

export default function KnowledgeBasePage() {
  const { viewAsRole } = useRole();
  const [stats, setStats] = useState<Stats>({});
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  async function loadStats() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("embed-sync", { body: { op: "stats" } });
      if (error) throw error;
      setStats((data?.stats ?? {}) as Stats);
    } catch (e) {
      toast({ title: "Failed to load stats", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function runBulkSync() {
    if (!confirm("Re-embed all records? This takes ~1-3 minutes and uses Gemini quota.")) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("embed-sync", { body: { op: "bulk-sync" } });
      if (error) throw error;
      toast({ title: "Sync complete", description: JSON.stringify(data?.results ?? {}) });
      loadStats();
    } catch (e) {
      toast({ title: "Sync failed", description: String(e), variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  async function runSearch() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("embed-sync", {
        body: { op: "search", query: query.trim(), limit: 8, threshold: 0.6 },
      });
      if (error) throw error;
      setResults((data?.results ?? []) as SearchResult[]);
    } catch (e) {
      toast({ title: "Search failed", description: String(e), variant: "destructive" });
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => { loadStats(); }, []);

  if (viewAsRole !== "admin") {
    return (
      <section className="rounded-2xl border border-n200 bg-card p-6 shadow-sm">
        <p className="text-n700">Only admins can view the AI knowledge base.</p>
      </section>
    );
  }

  const totalEmbeddings = Object.values(stats).reduce((sum, s) => sum + (s?.count ?? 0), 0);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-n200 bg-card p-6 shadow-sm">
        <header className="mb-5 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-orange-50 text-orange-600">
            <Brain className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div className="flex-1">
            <h4 className="text-[16px] font-semibold text-n900">AI Knowledge Base</h4>
            <p className="text-[13px] text-n500 mt-0.5">
              The copilot retrieves embeddings across all your records, actions, and views — LMP processes, students, POCs, mentors, alumni, domains, candidates, sessions, comments, checklists, timeline, daily logs, and activity logs — to answer with grounded data.
              {totalEmbeddings > 0 && <> Currently indexing <b>{totalEmbeddings.toLocaleString()}</b> records.</>}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadStats} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          </Button>
        </header>

        <div className="overflow-hidden rounded-xl border border-n200">
          <table className="w-full text-[13px]">
            <thead className="bg-n50 text-n600">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Table</th>
                <th className="px-4 py-2.5 text-right font-medium">Embeddings</th>
                <th className="px-4 py-2.5 text-right font-medium">Last synced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-n100">
              {TABLES.map((t) => {
                const s = stats[t] ?? { count: 0, last_embedded_at: null };
                return (
                  <tr key={t}>
                    <td className="px-4 py-2.5 font-mono text-n800">{t}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-n900">{s.count.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-n600">{timeAgo(s.last_embedded_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Button onClick={runBulkSync} disabled={syncing} className="gap-2">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            {syncing ? "Syncing…" : "Sync all records"}
          </Button>
          <p className="text-[12px] text-n500">
            Triggers auto-embed new/updated records. Use this only for initial sync or after schema changes.
          </p>
        </div>
      </section>

      <EmbeddingsQuotaPanel />


      <section className="rounded-2xl border border-n200 bg-card p-6 shadow-sm">
        <header className="mb-4 flex items-center gap-2">
          <Search className="h-4 w-4 text-orange-600" />
          <h4 className="text-[15px] font-semibold text-n900">Test semantic search</h4>
        </header>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="e.g. Finance PM roles with strong modeling skills"
          />
          <Button onClick={runSearch} disabled={searching || !query.trim()}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </div>

        {results.length > 0 && (
          <ul className="mt-5 space-y-3">
            {results.map((r) => (
              <li key={r.id} className="rounded-xl border border-n200 bg-n50/50 p-4">
                <div className="mb-1.5 flex items-center justify-between text-[12px]">
                  <span className="font-mono text-n600">{r.source_table}</span>
                  <span className="rounded-full bg-orange-50 px-2 py-0.5 font-medium text-orange-700">
                    {(r.similarity * 100).toFixed(0)}% match
                  </span>
                </div>
                <pre className="whitespace-pre-wrap text-[13px] text-n800 font-sans">{r.content}</pre>
              </li>
            ))}
          </ul>
        )}
        {!searching && query && results.length === 0 && (
          <p className="mt-4 text-[13px] text-n500">No results above threshold. Try a broader query.</p>
        )}
      </section>
    </div>
  );
}

function EmbeddingsQuotaPanel() {
  const { data, isLoading } = useAiUsage("24h");
  const stats = useMemo(() => {
    const rows = (data?.rows ?? []).filter((r) => r.feature === "embeddings");
    const requests = rows.length;
    const tokens = rows.reduce((sum, r) => sum + (r.total_tokens || r.prompt_tokens || 0), 0);
    const errors = rows.filter((r) => r.status && r.status !== "ok").length;
    const rateLimited = rows.filter((r) => r.status === "rate_limited").length;
    const lastError = rows.find((r) => r.error_message)?.error_message ?? null;
    // Gemini text-embedding-004 free tier: ~1500 RPM and ~1M tokens/min.
    // We surface a soft daily quota proxy (tokens used in 24h) so the user has a feel for spend.
    return { requests, tokens, errors, rateLimited, lastError };
  }, [data]);

  return (
    <section className="rounded-2xl border border-n200 bg-card p-6 shadow-sm">
      <header className="mb-4 flex items-center gap-2">
        <Gauge className="h-4 w-4 text-orange-600" />
        <h4 className="text-[15px] font-semibold text-n900">Embeddings quota & usage (last 24h)</h4>
        {isLoading && <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-n400" />}
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <QuotaTile label="Embed calls" value={stats.requests.toLocaleString()} />
        <QuotaTile label="Tokens" value={stats.tokens.toLocaleString()} hint="Billed against Gemini quota" />
        <QuotaTile label="Errors" value={stats.errors.toLocaleString()} tone={stats.errors > 0 ? "warn" : "ok"} />
        <QuotaTile label="Rate-limited" value={stats.rateLimited.toLocaleString()} tone={stats.rateLimited > 0 ? "warn" : "ok"} />
      </div>
      {stats.lastError && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="font-mono">{stats.lastError.slice(0, 200)}</span>
        </div>
      )}
      <p className="mt-3 text-[12px] text-n500">
        If you see rate-limit errors, pause and re-run <b>Sync all records</b> later — embeddings throttle at ~1500 req/min on the Gemini free tier.
      </p>
    </section>
  );
}

function QuotaTile({ label, value, hint, tone = "ok" }: { label: string; value: string; hint?: string; tone?: "ok" | "warn" }) {
  return (
    <div className={`rounded-xl border p-3 ${tone === "warn" ? "border-amber-200 bg-amber-50/50" : "border-n200 bg-n50/50"}`}>
      <div className="text-[11px] uppercase tracking-wide text-n500">{label}</div>
      <div className={`mt-1 text-[20px] font-semibold tabular-nums ${tone === "warn" ? "text-amber-700" : "text-n900"}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-n500">{hint}</div>}
    </div>
  );
}

