import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, AlertTriangle, Upload, Trash2, FlaskConical, Save, FileText, Settings, Stethoscope, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

import { cn } from "@/lib/utils";
import {
  getExternalDiscoveryConfig,
  fetchExternalDiscoveryConfig,
  setExternalDiscoveryConfig,
  EXTERNAL_REGION_OPTIONS,
  type ExternalDiscoveryConfig,
  type ExternalRegion,
} from "@/lib/externalDiscoveryConfig";
import {
  EXTERNAL_PLATFORMS as ROWS,
  EXTERNAL_PLATFORM_STATUS_DOT as STATUS_DOT,
} from "@/lib/externalPlatforms";
import {
  fetchTopmate,
  fetchADPList,
  fetchLinkedIn,
  fetchSuperpeer,
  saveLinkedinCache,
  clearLinkedinCache,
  getLinkedinCacheMeta,
  type LinkedinCacheMeta,
  fetchExternalMentorDiag,
  formatExternalMentorDiagSummary,
} from "@/lib/externalMentors";
import { useRole } from "@/lib/rolesContext";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

function formatExpires(meta: LinkedinCacheMeta | null, ttlH: number): string {
  if (!meta) return "Never";
  const remainingMs = meta.uploadedAt + ttlH * 3600 * 1000 - Date.now();
  if (remainingMs <= 0) return "Expired";
  const h = Math.floor(remainingMs / (3600 * 1000));
  const m = Math.floor((remainingMs % (3600 * 1000)) / 60000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

export function ExternalDiscoveryCard({ index = 3, readOnly = false }: { index?: number; readOnly?: boolean }) {
  return (
    <ErrorBoundary fallbackTitle="External discovery unavailable">
      <ExternalDiscoveryCardInner index={index} readOnly={readOnly} />
    </ErrorBoundary>
  );
}

function ExternalDiscoveryCardInner({ index = 3, readOnly = false }: { index?: number; readOnly?: boolean }) {
  const { role: appRole } = useRole();
  const canDiag = !readOnly && (appRole === "admin" || appRole === "allocator");
  const [cfg, setCfg] = useState<ExternalDiscoveryConfig>(() => {
    const { anyEnabled: _ignored, ...rest } = getExternalDiscoveryConfig();
    return rest;
  });
  const [liMeta, setLiMeta] = useState<LinkedinCacheMeta | null>(() => getLinkedinCacheMeta());
  const [testing, setTesting] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagSummary, setDiagSummary] = useState<string | null>(null);
  const [diagOk, setDiagOk] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const update = <K extends keyof ExternalDiscoveryConfig>(k: K, v: ExternalDiscoveryConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  const updateTtl = (k: keyof ExternalDiscoveryConfig["ttl"], v: number) =>
    setCfg((c) => ({ ...c, ttl: { ...c.ttl, [k]: Math.max(1, v) } }));

  useEffect(() => {
    fetchExternalDiscoveryConfig()
      .then(setCfg)
      .catch(() => { /* retain defaults */ });
  }, []);

  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    setSaving(true);
    try {
      await setExternalDiscoveryConfig(cfg);
      toast.success("External discovery settings saved");
    } catch (error) {
      toast.error(`Failed to save: ${(error as Error).message}`);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const runProviderDiag = async () => {
    setDiagLoading(true);
    try {
      const d = await fetchExternalMentorDiag();
      const jinaOk = !d.jinaKeyPresent || d.jinaPing.ok;
      const geminiOk =
        d.geminiGeneratePing?.ok === true &&
        !d.geminiGeneratePing?.blocked &&
        !d.geminiGroundingPing?.blocked;
      const ok = geminiOk && jinaOk;
      setDiagOk(ok);
      setDiagSummary(formatExternalMentorDiagSummary(d));
    } catch (e) {
      setDiagOk(false);
      setDiagSummary(`Diagnose failed: ${(e as Error).message}`);
    } finally {
      setDiagLoading(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    try {
      const queries = ["product manager mentor"];
      const empty = { mentors: [], errors: [] };
      const results = await Promise.all([
        cfg.topmate   ? fetchTopmate(queries, cfg)   : Promise.resolve(empty),
        cfg.adplist   ? fetchADPList(queries, cfg)   : Promise.resolve(empty),
        cfg.linkedin  ? fetchLinkedIn(queries, cfg)  : Promise.resolve(empty),
        cfg.superpeer ? fetchSuperpeer(queries, cfg) : Promise.resolve(empty),
      ]);
      const [tm, adp, li, sp] = results.map((r) => r.mentors.length);
      const total = tm + adp + li + sp;
      if (total === 0) {
        toast("Test connection: no records returned. CORS or empty cache likely — fetchers fail silently.");
      } else {
        toast.success(`Test ok · Topmate ${tm} · ADPList ${adp} · LinkedIn ${li} · Superpeer ${sp}`);
      }
    } finally {
      setTesting(false);
    }
  };

  const onUpload = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const finalize = (records: Array<Record<string, unknown>>) => {
      if (records.length === 0) {
        toast.error("No valid LinkedIn records found");
        return;
      }
      const count = saveLinkedinCache(records);
      setLiMeta(getLinkedinCacheMeta());
      toast.success(`${count} LinkedIn profiles cached · Expires in ${cfg.ttl.linkedin}h`);
    };

    if (ext === "json") {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed.results) ? parsed.results : [];
          finalize(arr);
        } catch {
          toast.error("Could not parse JSON");
        }
      };
      reader.readAsText(file);
      return;
    }
    if (ext === "csv") {
      import("papaparse").then((mod) => {
        const parse = mod.parse ?? (mod as any).default?.parse;
        if (!parse) { toast.error("CSV parser unavailable"); return; }
        parse<Record<string, string>>(file, {
          header: true,
          skipEmptyLines: true,
          complete: (res: any) => finalize(res.data || []),
          error: () => toast.error("Could not parse CSV"),
        });
      }).catch(() => toast.error("Could not load CSV parser"));
      return;
    }
    toast.error("Unsupported file — use .json or .csv");
  };

  const onClearCache = () => {
    clearLinkedinCache();
    setLiMeta(null);
    toast("LinkedIn cache cleared");
  };

  // Re-read meta on focus so the "expires" countdown stays roughly fresh.
  useEffect(() => {
    const handler = () => setLiMeta(getLinkedinCacheMeta());
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }, []);

  const [open, setOpen] = useState(false);
  const enabledPlatforms = ROWS.filter((r) => cfg[r.key]);

  const handleSaveAndClose = async () => {
    try {
      await onSave();
      setOpen(false);
    } catch {
      /* toast shown in onSave */
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.07, ease: [0, 0, 0.2, 1] }}
      className="rounded-2xl bg-card border border-n200 shadow-sm p-6 flex flex-col"
    >
      <header className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-md grid place-items-center shrink-0 bg-n900 text-white">
          <Globe className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-[18px] font-medium text-n900 truncate">External Mentor Discovery</h4>
            <span className="text-[10px] uppercase tracking-[0.5px] font-medium border rounded-full px-2 py-[2px] bg-n100 text-n600 border-n200">
              EXT
            </span>
          </div>
          <div className="text-[12px] text-n500 mt-1">
            Pulls mentors from LinkedIn, Topmate, and ADPList automatically when a match is run
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-n700 shrink-0">
          <span className="h-2 w-2 rounded-full bg-sage-400" />
          Synced
        </span>
      </header>

      {/* Compact summary: enabled platforms + LinkedIn cache status */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {enabledPlatforms.length === 0 ? (
          <span className="text-[12px] text-n500">No sources enabled</span>
        ) : (
          enabledPlatforms.map((r) => (
            <span
              key={r.key}
              className="inline-flex items-center gap-1.5 text-[11.5px] text-n700 bg-n50 border border-n200 rounded-full px-2.5 py-[3px]"
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[r.status])} />
              {r.label}
            </span>
          ))
        )}
        <span className="ml-auto text-[11px] text-n500 inline-flex items-center gap-1">
          <FileText className="h-3 w-3" />
          {liMeta
            ? `${liMeta.count} LinkedIn profiles · ${formatExpires(liMeta, cfg.ttl.linkedin)}`
            : "No LinkedIn cache"}
        </span>
      </div>

      {canDiag && (
        <div className="mt-5 rounded-md border border-n200 bg-n50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[13px] font-medium text-n900">Search providers (Gemini + Jina)</div>
              <p className="text-[11.5px] text-n500 mt-0.5">
                Checks Edge Function secrets the live mentor search pipeline uses.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void runProviderDiag()}
              disabled={diagLoading}
              className="inline-flex items-center gap-1.5 rounded-md border border-n300 bg-card px-3 py-1.5 text-[12px] font-medium text-n700 hover:bg-n100 disabled:opacity-50"
            >
              {diagLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Stethoscope className="h-3.5 w-3.5" />}
              {diagLoading ? "Checking…" : "Diagnose providers"}
            </button>
          </div>
          {diagSummary && (
            <div
              className={cn(
                "rounded-md border px-3 py-2.5 text-[11.5px] whitespace-pre-wrap leading-relaxed",
                diagOk
                  ? "border-sage-200 bg-sage-50 text-sage-900"
                  : "border-yellow-200 bg-yellow-50 text-yellow-900",
              )}
            >
              <div className="flex items-center gap-1.5 font-medium mb-1.5">
                {diagOk ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-sage-600" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-yellow-700" />
                )}
                {diagOk ? "Providers healthy" : "Action required"}
              </div>
              {diagSummary}
            </div>
          )}
        </div>
      )}

      {!readOnly && (
        <div className="mt-6 pt-4 border-t border-n100 flex items-center justify-end">
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-card border border-n300 hover:bg-n50 text-n800 text-[13px] font-medium px-3.5 py-2 transition-colors"
          >
            <Settings className="h-4 w-4" strokeWidth={1.5} />
            View Settings
          </button>
        </div>
      )}

      <Dialog open={!readOnly && open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>External Mentor Discovery — Settings</DialogTitle>
            <DialogDescription>
              Configure Topmate, ADPList, LinkedIn, and Superpeer connectors, cache TTLs, and the LinkedIn dataset.
            </DialogDescription>
          </DialogHeader>

          <div>
            {/* Platform toggle list */}
            <ul className="divide-y divide-n100">
              {ROWS.map((row) => {
                const enabled = cfg[row.key];
                return (
                  <li key={row.key} className="py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] font-medium text-n900">{row.label}</span>
                          <span className="text-[10px] uppercase tracking-[0.5px] font-medium text-n500 bg-n100 border border-n200 rounded-full px-2 py-[1px]">
                            {row.transport}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-n600">
                            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[row.status])} />
                            {row.note ?? "Ready"}
                          </span>
                        </div>
                      </div>
                      <Switch
                        checked={enabled}
                        onCheckedChange={(v) => update(row.key, v)}
                        className="data-[state=checked]:bg-orange-500 data-[state=unchecked]:bg-n300"
                      />
                    </div>

                    <AnimatePresence initial={false}>
                      {row.key === "linkedin" && enabled && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-[12px] text-yellow-800 flex items-start gap-2">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>
                              Direct LinkedIn scraping is restricted by ToS. Use only pre-cached datasets or API partners
                              (Proxycurl / Nubela). Never scrape directly in production.
                            </span>
                          </div>
                        </motion.div>
                      )}
                      {row.key === "superpeer" && enabled && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 rounded-md border border-n200 bg-n50 px-3 py-2 text-[12px] text-n600">
                            Lower signal source — <code className="font-mono text-n700">source_score = 0</code> applied.
                            Results will appear in L4/L5 tiers only.
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>

            {/* Search region */}
            <div className="mt-5 rounded-md border border-n200 bg-card p-4">
              <div className="label-eyebrow mb-2">Search Region</div>
              <p className="text-[12px] text-n500 mb-2">
                Scope AI discovery to a specific country. Choose Global to search worldwide.
              </p>
              <select
                value={cfg.region}
                onChange={(e) => update("region", e.target.value as ExternalRegion)}
                className="w-full h-9 rounded-md border border-n300 bg-card px-3 text-[13px] text-n900 focus:outline-none focus:border-orange-400"
              >
                {EXTERNAL_REGION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>


            {/* Cache TTL settings */}
            <div className="mt-5 rounded-md border border-n200 bg-n50 p-4">
              <div className="label-eyebrow mb-3">Cache TTL settings</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(["topmate", "linkedin", "adplist"] as const).map((k) => (
                  <label key={k} className="flex items-center justify-between gap-2 text-[12px] text-n700 bg-card border border-n200 rounded-md px-3 py-2">
                    <span className="capitalize">{k}</span>
                    <span className="inline-flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        value={cfg.ttl[k]}
                        onChange={(e) => updateTtl(k, Number(e.target.value) || 1)}
                        className="w-14 h-7 rounded-md border border-n300 bg-card px-2 text-[12px] tabular-nums focus:outline-none focus:border-orange-400"
                      />
                      <span className="text-n500">hrs</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* LinkedIn cache upload */}
            <div className="mt-5 rounded-md border border-n200 bg-card p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-n900">LinkedIn Cached Dataset</div>
                  <div className="text-[12px] text-n500 mt-0.5">
                    Upload a pre-exported JSON or CSV from Proxycurl / Nubela API. Used instead of direct scraping.
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-3.5 py-2 shadow-sm transition-colors"
                >
                  <Upload className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Upload LinkedIn Dataset
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".json,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUpload(f);
                    e.target.value = "";
                  }}
                />
                {liMeta && (
                  <button
                    onClick={onClearCache}
                    className="inline-flex items-center gap-1.5 text-[12px] text-n600 hover:text-coral-600 hover:bg-n100 rounded-md px-2 py-2 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Clear Cache
                  </button>
                )}
                <span className="text-[11px] text-n500 inline-flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {liMeta
                    ? `${liMeta.count} profiles · Last upload ${new Date(liMeta.uploadedAt).toLocaleString()} · ${formatExpires(liMeta, cfg.ttl.linkedin)}`
                    : "Last upload: Never · Cache expires 24h after upload"}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-n400">Accepts: .json, .csv</p>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between gap-3 flex-wrap sm:justify-between">
            <button
              onClick={onTest}
              disabled={testing}
              className="inline-flex items-center gap-2 rounded-md bg-card border border-n300 hover:bg-n50 text-n800 text-[13px] font-medium px-3.5 py-2 transition-colors disabled:opacity-50"
            >
              <FlaskConical className="h-4 w-4" strokeWidth={1.5} />
              {testing ? "Testing…" : "Test Connection"}
            </button>
            <button
              onClick={() => void handleSaveAndClose()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-3.5 py-2 shadow-sm transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" strokeWidth={1.5} />
              {saving ? "Saving…" : "Save Settings"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.section>
  );
}
