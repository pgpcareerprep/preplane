import { Star } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { FeedbackField, FeedbackTheme, RatingGroupRow } from "@/lib/feedbackForm";

type Theme = "dark" | "light";

export function DynamicFeedbackForm({
  fields,
  values,
  onChange,
  theme = "dark",
  themeOverrides,
}: {
  fields: FeedbackField[];
  values: Record<string, any>;
  onChange: (id: string, v: any) => void;
  theme?: Theme;
  themeOverrides?: FeedbackTheme;
}) {
  const mode: Theme = themeOverrides?.mode ?? theme;
  const style: CSSProperties = themeOverrides
    ? ({
        ["--fb-accent" as any]: themeOverrides.accent,
        ["--fb-text" as any]: themeOverrides.text,
      } as CSSProperties)
    : {};
  return (
    <div className="space-y-5" style={style}>
      {fields.map((f) => (
        <FieldRenderer
          key={f.id}
          field={f}
          value={values[f.id]}
          onChange={(v) => onChange(f.id, v)}
          theme={mode}
          custom={!!themeOverrides}
        />
      ))}
    </div>
  );
}

function FieldRenderer({
  field, value, onChange, theme, custom,
}: { field: FeedbackField; value: any; onChange: (v: any) => void; theme: Theme; custom?: boolean }) {
  const t = themeTokens(theme, custom);

  if (field.type === "vibe") {
    return (
      <Section label={field.label} theme={theme}>
        <div className="grid grid-cols-5 gap-2">
          {field.options.map((v) => {
            const active = value === v.value;
            return (
              <button
                key={v.value}
                type="button"
                onClick={() => onChange(v.value)}
                className={cn(
                  "rounded-xl border px-1 py-3 flex flex-col items-center gap-1.5 transition-all",
                  active ? t.vibeActive : t.vibeIdle,
                )}
              >
                <span className="text-[24px] leading-none">{v.emoji}</span>
                <span className={cn("text-[11px] font-medium", active ? t.vibeLabelActive : t.vibeLabel)}>{v.label}</span>
              </button>
            );
          })}
        </div>
      </Section>
    );
  }

  if (field.type === "rating") {
    return (
      <div className={cn("rounded-xl px-4 py-3 flex items-center justify-between", t.rowSurface)}>
        <span className={cn("text-[13.5px] font-medium", t.label)}>{field.label}{field.required ? <span className="text-coral-500"> *</span> : null}</span>
        <Stars value={Number(value) || 0} onChange={onChange} theme={theme} />
      </div>
    );
  }

  if (field.type === "rating_group") {
    return (
      <Section label={field.label} theme={theme}>
        <div className={cn("rounded-xl divide-y", t.groupSurface)}>
          {field.options.map((row: RatingGroupRow) => (
            <div key={row.key} className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <div className={cn("text-[14px] font-semibold", t.label)}>{row.label}</div>
                {row.helper && <div className={cn("text-[12px] mt-0.5", t.muted)}>{row.helper}</div>}
              </div>
              <Stars
                value={Number(value?.[row.key]) || 0}
                onChange={(v) => onChange({ ...(value || {}), [row.key]: v })}
                theme={theme}
              />
            </div>
          ))}
        </div>
      </Section>
    );
  }

  if (field.type === "toggle_group") {
    return (
      <Section label={field.label} theme={theme}>
        <div className={cn("rounded-xl divide-y", t.groupSurface)}>
          {field.options.map((row: { key: string; label: string; helper?: string }) => {
            const on = !!value?.[row.key];
            return (
              <div key={row.key} className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <div className={cn("text-[14px] font-semibold", t.label)}>{row.label}</div>
                  {row.helper && <div className={cn("text-[12px] mt-0.5", t.muted)}>{row.helper}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => onChange({ ...(value || {}), [row.key]: !on })}
                  className={cn("relative h-6 w-11 rounded-full transition-colors shrink-0 overflow-hidden", on ? "bg-orange-500" : t.toggleOff)}
                >
                  <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-card shadow transition-transform", on ? "translate-x-5" : "translate-x-0")} />
                </button>
              </div>
            );
          })}
        </div>
      </Section>
    );
  }

  if (field.type === "textarea") {
    const min = (field as any).minChars as number | undefined;
    const meets = !min || (typeof value === "string" && value.length >= min);
    return (
      <Section
        label={
          <>
            {field.label}
            {!field.required && <span className={cn("normal-case tracking-normal", t.muted)}> (optional)</span>}
            {field.required && <span className="text-coral-500"> *</span>}
          </>
        }
        theme={theme}
      >
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={(field as any).placeholder}
          className={cn("w-full rounded-xl px-4 py-3 text-[13.5px] resize-none focus:outline-none", t.input)}
        />
        {min !== undefined && (
          <div className={cn("text-[11px] mt-1 tabular-nums", meets ? "text-sage-500" : t.muted)}>
            {(value || "").length} / {min} chars min
          </div>
        )}
      </Section>
    );
  }

  if (field.type === "text") {
    return (
      <Section label={<>{field.label}{field.required ? <span className="text-coral-500"> *</span> : null}</>} theme={theme}>
        <input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={(field as any).placeholder}
          className={cn("w-full h-10 rounded-xl px-4 text-[13.5px] focus:outline-none", t.input)}
        />
      </Section>
    );
  }

  if (field.type === "toggle") {
    return (
      <div className={cn("rounded-xl px-4 py-3.5 flex items-center justify-between", t.rowSurface)}>
        <span className={cn("text-[13.5px] font-medium", t.label)}>
          {field.label}{field.required ? <span className="text-coral-500"> *</span> : null}
        </span>
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={cn("relative h-6 w-11 rounded-full transition-colors overflow-hidden", value ? "bg-orange-500" : t.toggleOff)}
        >
          <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-card shadow transition-transform", value ? "translate-x-5" : "translate-x-0")} />
        </button>
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <Section label={<>{field.label}{field.required ? <span className="text-coral-500"> *</span> : null}</>} theme={theme}>
        <select
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className={cn("w-full h-10 rounded-xl px-3 text-[13.5px] focus:outline-none", t.input)}
        >
          <option value="">Select…</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Section>
    );
  }

  if (field.type === "confirm") {
    return (
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-orange-500"
        />
        <span className={cn("text-[12.5px]", t.muted)}>{field.label}</span>
      </label>
    );
  }

  return null;
}

function Section({ label, children, theme }: { label: React.ReactNode; children: React.ReactNode; theme: Theme }) {
  const t = themeTokens(theme);
  return (
    <div>
      <div className={cn("text-[11px] uppercase tracking-[0.8px] font-semibold mb-2", t.sectionLabel)}>{label}</div>
      {children}
    </div>
  );
}

function Stars({ value, onChange, theme }: { value: number; onChange: (v: number) => void; theme: Theme }) {
  const empty = theme === "dark" ? "text-white/25" : "text-n300";
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} className="p-0.5">
          <Star className={cn("h-[18px] w-[18px] transition-colors", n <= value ? "fill-orange-400 text-orange-400" : empty)} />
        </button>
      ))}
    </div>
  );
}

function themeTokens(theme: Theme, custom?: boolean) {
  const accent = custom
    ? {
        vibeActive: "border-[var(--fb-accent)] ring-1 ring-[var(--fb-accent)] bg-[color:var(--fb-accent)]/15",
        input: theme === "dark"
          ? "bg-card/[0.03] border border-white/10 text-[color:var(--fb-text)] placeholder:text-white/35 focus:border-[var(--fb-accent)]"
          : "bg-card border border-n300 text-[color:var(--fb-text)] placeholder:text-n400 focus:border-[var(--fb-accent)]",
      }
    : null;
  if (theme === "dark") {
    return {
      sectionLabel: "text-white/40",
      label: custom ? "text-[color:var(--fb-text)]" : "text-white",
      muted: "text-white/50",
      vibeIdle: "bg-card/[0.03] border-white/10 hover:bg-card/[0.06]",
      vibeActive: accent?.vibeActive ?? "bg-orange-500/15 border-orange-500 ring-1 ring-orange-500",
      vibeLabel: "text-white/70",
      vibeLabelActive: custom ? "text-[color:var(--fb-text)]" : "text-white",
      rowSurface: "bg-card/[0.03] border border-white/10",
      groupSurface: "bg-card/[0.03] border border-white/10 divide-white/10",
      input: accent?.input ?? "bg-card/[0.03] border border-white/10 text-white placeholder:text-white/35 focus:border-orange-400/60",
      toggleOff: "bg-card/15",
    };
  }
  return {
    sectionLabel: "text-n500",
    label: custom ? "text-[color:var(--fb-text)]" : "text-n800",
    muted: "text-n500",
    vibeIdle: "bg-n50 border-n200 hover:bg-n100",
    vibeActive: accent?.vibeActive ?? "bg-orange-50 border-orange-400 ring-1 ring-orange-400",
    vibeLabel: "text-n600",
    vibeLabelActive: custom ? "text-[color:var(--fb-text)]" : "text-n900",
    rowSurface: "bg-n50 border border-n200",
    groupSurface: "bg-n50 border border-n200 divide-n200",
    input: accent?.input ?? "bg-card border border-n300 text-n800 placeholder:text-n400 focus:border-orange-400",
    toggleOff: "bg-n300",
  };
}
