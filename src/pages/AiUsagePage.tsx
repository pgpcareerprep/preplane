import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, Zap, AlertCircle, Activity } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { useAiUsage, type AiUsageRange } from "@/hooks/useAiUsage";
import { useRole } from "@/lib/rolesContext";

const RANGES: { value: AiUsageRange; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d",  label: "7 days" },
  { value: "30d", label: "30 days" },
];

const FEATURE_LABEL: Record<string, string> = {
  copilot: "Copilot chat",
  voice: "Voice copilot",
  tts: "Text-to-speech",
  parse_jd: "JD parsing",
  embeddings: "Embeddings",
};

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(24 95% 53%)",
  "hsl(173 58% 39%)",
  "hsl(262 83% 58%)",
  "hsl(43 96% 56%)",
  "hsl(199 89% 48%)",
];

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}
function fmtTime(s: string) {
  return new Date(s).toLocaleString();
}

function Kpi({ icon: Icon, label, value, sub }: { icon: typeof Sparkles; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-[12px]">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function AiUsagePage() {
  const { role } = useRole();
  const isAdmin = role === "admin" || role === "allocator";
  const [range, setRange] = useState<AiUsageRange>("7d");
  const { data, isLoading, isError, error } = useAiUsage(range);

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-60" />
          AI usage analytics are only available to admins and allocators.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">AI Usage</h2>
          <p className="text-[12px] text-muted-foreground">
            Requests, tokens and activity across every AI feature in the app.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {RANGES.map(r => (
            <Button
              key={r.value}
              size="sm"
              variant={range === r.value ? "default" : "ghost"}
              onClick={() => setRange(r.value)}
              className="h-7 px-3 text-[12px]"
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="p-4 text-destructive text-[13px]">
            Failed to load AI usage: {(error as Error)?.message ?? "unknown error"}
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi icon={Activity} label="Total requests" value={fmtNum(data.totalRequests)} sub={`in last ${range}`} />
            <Kpi icon={Zap} label="Total tokens" value={fmtNum(data.totalTokens)} sub={`avg ${data.totalRequests ? Math.round(data.totalTokens / data.totalRequests) : 0} / req`} />
            <Kpi icon={Sparkles} label="Top feature" value={FEATURE_LABEL[data.byFeature[0]?.feature ?? ""] || data.byFeature[0]?.feature || "—"} sub={data.byFeature[0] ? `${fmtNum(data.byFeature[0].requests)} requests` : ""} />
            <Kpi icon={AlertCircle} label="Errors" value={fmtNum(data.errorCount)} sub={data.totalRequests ? `${((data.errorCount / data.totalRequests) * 100).toFixed(1)}% of calls` : ""} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-[14px]">Requests per day</CardTitle></CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.byDay}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                      <Area type="monotone" dataKey="requests" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-[14px]">Feature mix</CardTitle></CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.byFeature} dataKey="requests" nameKey="feature" outerRadius={70} label>
                        {data.byFeature.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <CardHeader><CardTitle className="text-[14px]">By model</CardTitle></CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.byModel}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="model" stroke="hsl(var(--muted-foreground))" fontSize={10} interval={0} angle={-15} textAnchor="end" height={60} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                      <Bar dataKey="tokens" fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-[14px]">By user</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead className="text-right">Requests</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Last active</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byUser.slice(0, 8).map(u => (
                      <TableRow key={u.user_id}>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell className="text-right">{fmtNum(u.requests)}</TableCell>
                        <TableCell className="text-right">{fmtNum(u.tokens)}</TableCell>
                        <TableCell className="text-right text-[11px] text-muted-foreground">{fmtTime(u.last)}</TableCell>
                      </TableRow>
                    ))}
                    {data.byUser.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No user activity in range.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-[14px]">Recent activity</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Feature</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Latency</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.slice(0, 50).map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-[11px] text-muted-foreground">{fmtTime(r.created_at)}</TableCell>
                      <TableCell>{FEATURE_LABEL[r.feature] || r.feature}</TableCell>
                      <TableCell className="text-[12px] font-mono">{r.model ?? "—"}</TableCell>
                      <TableCell className="text-right">{r.total_tokens || 0}</TableCell>
                      <TableCell className="text-right">{r.latency_ms ? `${r.latency_ms} ms` : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "ok" ? "secondary" : "destructive"} className="text-[10px]">
                          {r.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
