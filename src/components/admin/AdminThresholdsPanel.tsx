import { useEffect, useState } from "react";
import { Save, Users, AlertTriangle, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchPlatformThresholds,
  savePlatformThresholds,
  DEFAULT_THRESHOLDS,
  type PlatformThresholds,
} from "@/lib/platformThresholds";

type ThresholdKey = "poc_concurrent" | "near_threshold";

type Threshold = {
  id: ThresholdKey;
  label: string;
  helper: string;
  unit: string;
  min: number;
  max: number;
  icon: typeof Users;
};

const DEFS: Threshold[] = [
  { id: "poc_concurrent", label: "POC Concurrent Processes",  helper: "Max active processes a single POC can own at once.", unit: "processes", min: 1, max: 50, icon: Users },
  { id: "near_threshold", label: "Near-Threshold Warning",    helper: "Trigger 'near capacity' warning at this percentage of the POC limit.", unit: "%", min: 50, max: 100, icon: AlertTriangle },
];

export function AdminThresholdsPanel() {
  const [values, setValues] = useState<PlatformThresholds>(() => ({ ...DEFAULT_THRESHOLDS }));
  const [savedSnapshot, setSavedSnapshot] = useState<PlatformThresholds>(() => ({ ...DEFAULT_THRESHOLDS }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Threshold | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchPlatformThresholds()
      .then((v) => {
        if (!mounted) return;
        setValues(v);
        setSavedSnapshot(v);
      })
      .catch((e) => toast.error("Could not load thresholds", { description: e?.message }))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const dirty = DEFS.some((d) => values[d.id] !== savedSnapshot[d.id]);

  const update = (id: ThresholdKey, value: number) => {
    setValues((prev) => ({ ...prev, [id]: value }));
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await savePlatformThresholds(values);
      setSavedSnapshot(values);
      toast.success("Thresholds saved");
    } catch (e: any) {
      toast.error("Save failed", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <h3 className="text-[24px] font-semibold tracking-[-0.5px] text-n900">Platform Thresholds</h3>
        <p className="text-[13px] text-n500 mt-1">Workload limits and SLA timers applied platform-wide.</p>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-n500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading current values…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DEFS.map(t => {
            const Icon = t.icon;
            const value = values[t.id];
            const pct = ((value - t.min) / (t.max - t.min)) * 100;
            return (
              <div key={t.id} className="rounded-lg bg-card border border-n200 shadow-sm p-5">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 grid place-items-center rounded-md bg-orange-50 text-orange-600 shrink-0">
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h5 className="text-[14px] font-medium text-n900">{t.label}</h5>
                      <div className="flex items-center gap-2">
                        <div className="tabular-nums text-[18px] font-semibold text-n900">
                          {value}<span className="text-[12px] text-n500 font-normal ml-1">{t.unit}</span>
                        </div>
                        <button
                          onClick={() => setEditing(t)}
                          className="inline-flex items-center gap-1 text-[12px] text-n600 hover:text-n900 hover:bg-n100 rounded-md px-2 py-1 transition-colors duration-150"
                          aria-label={`Edit ${t.label}`}
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                          Edit
                        </button>
                      </div>
                    </div>
                    <p className="text-[12px] text-n500 mt-1 leading-[1.5]">{t.helper}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <input
                    type="range"
                    min={t.min}
                    max={t.max}
                    value={value}
                    onChange={e => update(t.id, Number(e.target.value))}
                    className="w-full accent-orange-500"
                    style={{ background: `linear-gradient(to right, hsl(var(--orange-500)) ${pct}%, hsl(var(--n200)) ${pct}%)` }}
                  />
                  <div className="flex justify-between text-[11px] text-n400 mt-1 tabular-nums">
                    <span>{t.min}{t.unit}</span>
                    <span>{t.max}{t.unit}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        disabled={!dirty || saving}
        onClick={onSave}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md text-white text-[14px] font-medium px-4 py-2.5 shadow-sm transition-colors duration-150 ease-smooth",
          dirty && !saving ? "bg-orange-500 hover:bg-orange-600" : "bg-n300 cursor-not-allowed",
        )}
      >
        {saving
          ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
          : <Save className="h-4 w-4" strokeWidth={1.75} />}
        {saving ? "Saving…" : dirty ? "Save Thresholds" : "All Saved"}
      </button>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <EditThresholdDialog
            threshold={editing}
            initialValue={values[editing.id]}
            onCancel={() => setEditing(null)}
            onSave={(value) => {
              update(editing.id, value);
              setEditing(null);
            }}
          />
        )}
      </Dialog>
    </section>
  );
}

function EditThresholdDialog({
  threshold, initialValue, onSave, onCancel,
}: { threshold: Threshold; initialValue: number; onSave: (v: number) => void; onCancel: () => void }) {
  const [value, setValue] = useState<number>(initialValue);
  const [error, setError] = useState<string | null>(null);

  const validate = (v: number) => {
    if (Number.isNaN(v))            return "Value is required.";
    if (!Number.isFinite(v))        return "Value must be a number.";
    if (v < threshold.min)          return `Minimum is ${threshold.min}${threshold.unit}.`;
    if (v > threshold.max)          return `Maximum is ${threshold.max}${threshold.unit}.`;
    return null;
  };

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate(value);
    if (err) { setError(err); return; }
    onSave(value);
  };

  const Icon = threshold.icon;
  const pct = ((value - threshold.min) / (threshold.max - threshold.min)) * 100;

  return (
    <DialogContent className="sm:max-w-[460px]">
      <DialogHeader>
        <DialogTitle className="text-[18px] font-medium">Edit threshold</DialogTitle>
      </DialogHeader>

      <div className="flex items-start gap-3 py-2">
        <div className="h-10 w-10 grid place-items-center rounded-md bg-orange-50 text-orange-600 shrink-0">
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <div className="text-[14px] text-n900 font-medium">{threshold.label}</div>
          <p className="text-[12px] text-n500 mt-0.5 leading-[1.5]">{threshold.helper}</p>
        </div>
      </div>

      <form onSubmit={handle} className="space-y-4 py-2">
        <label className="block">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-[13px] font-medium text-n600">Value</span>
            <span className="text-[11px] text-n400 tabular-nums">
              Allowed: {threshold.min}–{threshold.max}{threshold.unit}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={threshold.min}
              max={threshold.max}
              value={Number.isNaN(value) ? "" : value}
              onChange={(e) => {
                const v = e.target.value === "" ? NaN : Number(e.target.value);
                setValue(v);
                setError(validate(v));
              }}
              className={cn(
                "w-full h-10 rounded-md border bg-card px-3 text-[14px] tabular-nums focus:outline-none focus-visible:shadow-focus transition-colors duration-150",
                error ? "border-coral-400 focus:border-coral-400" : "border-n300 focus:border-orange-400",
              )}
            />
            <span className="text-[13px] text-n500 tabular-nums shrink-0">{threshold.unit}</span>
          </div>
          {error && <div className="mt-1.5 text-[12px] text-coral-600">{error}</div>}
        </label>

        <div>
          <input
            type="range"
            min={threshold.min}
            max={threshold.max}
            value={Number.isNaN(value) ? threshold.min : value}
            onChange={(e) => { const v = Number(e.target.value); setValue(v); setError(validate(v)); }}
            className="w-full accent-orange-500"
            style={{ background: `linear-gradient(to right, hsl(var(--orange-500)) ${Math.max(0, Math.min(100, pct))}%, hsl(var(--n200)) ${Math.max(0, Math.min(100, pct))}%)` }}
          />
          <div className="flex justify-between text-[11px] text-n400 mt-1 tabular-nums">
            <span>{threshold.min}{threshold.unit}</span>
            <span>{threshold.max}{threshold.unit}</span>
          </div>
        </div>

        <DialogFooter className="pt-2 gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-card border border-n300 hover:bg-n50 text-n800 text-[14px] font-medium px-4 py-2.5 transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!!error}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-md text-white text-[14px] font-medium px-4 py-2.5 shadow-sm transition-colors duration-150 ease-smooth",
              error ? "bg-n300 cursor-not-allowed" : "bg-orange-500 hover:bg-orange-600",
            )}
          >
            Save
          </button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
