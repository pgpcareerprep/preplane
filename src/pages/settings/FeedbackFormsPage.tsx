import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Plus, Trash2, ArrowUp, ArrowDown, RotateCcw, Save, ChevronDown, ChevronRight, FilePlus, Palette } from "lucide-react";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useFeedbackTemplate, useSaveFeedbackTemplate } from "@/lib/hooks/useFeedbackTemplates";
import {
  type Audience,
  type FeedbackField,
  type FieldType,
  type FeedbackTemplate,
  type FeedbackTheme,
  FIELD_TYPE_LABELS,
  fallbackTemplate,
  blankTemplate,
  defaultTheme,
  initialValues,
  makeDefaultField,
} from "@/lib/feedbackForm";
import { DynamicFeedbackForm } from "@/components/feedback/DynamicFeedbackForm";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const AUDIENCES: { id: Audience; label: string; description: string }[] = [
  { id: "student", label: "Student form", description: "Filled by students after a session is closed (/feedback/:token)." },
  { id: "poc", label: "POC form", description: "Filled by POC from the Sessions tab when marking a session closed." },
];

const FIELD_TYPES: FieldType[] = ["vibe", "rating", "rating_group", "toggle_group", "textarea", "text", "toggle", "select", "confirm"];

export default function FeedbackFormsPage() {
  const [audience, setAudience] = useState<Audience>("student");

  useRealtimeInvalidate("feedback_templates", [["db-feedback-templates"], ["feedback-templates"]], { enabled: true });

  return (
    <div>
      <header className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-orange-50 text-orange-600 grid place-items-center">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-[20px] font-semibold text-n900">Feedback Forms</h1>
          <p className="text-[13px] text-n500">Build the post-session forms students and POCs fill out. Saved forms are used live.</p>
        </div>
      </header>

      <div className="inline-flex rounded-lg border border-n200 bg-card p-1 mb-5">
        {AUDIENCES.map((a) => (
          <button
            key={a.id}
            onClick={() => setAudience(a.id)}
            className={cn(
              "px-3 h-8 rounded-md text-[12.5px] font-medium transition-colors",
              audience === a.id ? "bg-orange-500 text-white" : "text-n600 hover:bg-n100",
            )}
          >
            {a.label}
          </button>
        ))}
      </div>

      <Editor key={audience} audience={audience} />
    </div>
  );
}

function Editor({ audience }: { audience: Audience }) {
  const { data: tpl, isLoading } = useFeedbackTemplate(audience);
  const save = useSaveFeedbackTemplate();
  const [draft, setDraft] = useState<FeedbackTemplate | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [previewValues, setPreviewValues] = useState<Record<string, any>>({});
  const [blankConfirm, setBlankConfirm] = useState(false);

  useEffect(() => {
    if (tpl && !draft) {
      setDraft(tpl);
      setPreviewValues(initialValues(tpl.fields));
    }
  }, [tpl, draft]);

  // refresh preview values when fields list changes shape
  useEffect(() => {
    if (draft) setPreviewValues((v) => ({ ...initialValues(draft.fields), ...v }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.fields.length]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(tpl), [draft, tpl]);

  if (isLoading || !draft) {
    return <div className="text-[13px] text-n500">Loading…</div>;
  }

  const update = (patch: Partial<FeedbackTemplate>) => setDraft({ ...draft, ...patch });
  const updateField = (id: string, patch: Partial<FeedbackField>) =>
    setDraft({ ...draft, fields: draft.fields.map((f) => (f.id === id ? ({ ...f, ...patch } as FeedbackField) : f)) });
  const removeField = (id: string) => setDraft({ ...draft, fields: draft.fields.filter((f) => f.id !== id) });
  const addField = (type: FieldType) => setDraft({ ...draft, fields: [...draft.fields, makeDefaultField(type)] });
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...draft.fields];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setDraft({ ...draft, fields: next });
  };
  const reset = () => {
    const f = fallbackTemplate(audience);
    setDraft(f);
    setPreviewValues(initialValues(f.fields));
  };
  const startBlank = () => {
    const f = blankTemplate(audience);
    setDraft(f);
    setPreviewValues(initialValues(f.fields));
    setBlankConfirm(false);
  };
  const updateTheme = (patch: Partial<FeedbackTheme>) =>
    setDraft({ ...draft, theme: { ...draft.theme, ...patch } });
  const resetColors = () => setDraft({ ...draft, theme: defaultTheme(audience) });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6">
      <div>
        {/* Header card */}
        <div className="rounded-xl bg-card border border-n200 p-4 mb-4 space-y-3">
          <Field label="Title">
            <input
              value={draft.title}
              onChange={(e) => update({ title: e.target.value })}
              className="w-full h-9 rounded-md border border-n300 bg-card px-3 text-[13px] focus:outline-none focus:border-orange-400"
            />
          </Field>
          <Field label="Subtitle">
            <input
              value={draft.subtitle}
              onChange={(e) => update({ subtitle: e.target.value })}
              className="w-full h-9 rounded-md border border-n300 bg-card px-3 text-[13px] focus:outline-none focus:border-orange-400"
            />
          </Field>
          <Field label="Submit button label">
            <input
              value={draft.submit_label}
              onChange={(e) => update({ submit_label: e.target.value })}
              className="w-full h-9 rounded-md border border-n300 bg-card px-3 text-[13px] focus:outline-none focus:border-orange-400"
            />
          </Field>
        </div>

        {/* Appearance card */}
        <div className="rounded-xl bg-card border border-n200 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-n500" />
              <h3 className="text-[13px] font-semibold text-n800">Appearance</h3>
            </div>
            <button onClick={resetColors} className="text-[11.5px] text-n500 hover:text-n800 inline-flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> Reset colors
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mode">
              <div className="inline-flex rounded-md border border-n200 p-0.5 w-full">
                {(["dark","light"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => updateTheme({ mode: m })}
                    className={cn(
                      "flex-1 h-8 rounded text-[12px] font-medium capitalize",
                      draft.theme.mode === m ? "bg-orange-500 text-white" : "text-n600 hover:bg-n100",
                    )}
                  >{m}</button>
                ))}
              </div>
            </Field>
            <ColorField label="Accent" value={draft.theme.accent} onChange={(v) => updateTheme({ accent: v })} />
            <ColorField label="Surface" value={draft.theme.surface} onChange={(v) => updateTheme({ surface: v })} />
            <ColorField label="Text" value={draft.theme.text} onChange={(v) => updateTheme({ text: v })} />
          </div>
        </div>

        {/* Field list */}
        <div className="space-y-2">
          {draft.fields.map((f, i) => {
            const open = expanded[f.id];
            return (
              <div key={f.id} className="rounded-xl bg-card border border-n200">
                <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                  <button
                    onClick={() => setExpanded({ ...expanded, [f.id]: !open })}
                    className="text-n400 hover:text-n800"
                    aria-label={open ? "Collapse" : "Expand"}
                  >
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <span className="text-[10.5px] uppercase tracking-[0.5px] font-semibold text-n500 bg-n100 rounded px-1.5 py-0.5 shrink-0">
                    {FIELD_TYPE_LABELS[f.type]}
                  </span>
                  <input
                    value={f.label}
                    onChange={(e) => updateField(f.id, { label: e.target.value })}
                    placeholder="Field label…"
                    className="flex-1 min-w-[160px] h-8 rounded-md border border-n200 bg-n50 hover:bg-card focus:bg-card focus:border-orange-400 px-2 text-[13px] text-n800 focus:outline-none"
                  />
                  <label className="flex items-center gap-1.5 text-[11.5px] text-n600 shrink-0">
                    <input
                      type="checkbox"
                      checked={!!f.required}
                      onChange={(e) => updateField(f.id, { required: e.target.checked })}
                      className="accent-orange-500 h-3.5 w-3.5"
                    />
                    Required
                  </label>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => move(i, -1)} className="text-n400 hover:text-n800 disabled:opacity-30" disabled={i === 0} aria-label="Move up">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => move(i, 1)} className="text-n400 hover:text-n800 disabled:opacity-30" disabled={i === draft.fields.length - 1} aria-label="Move down">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => removeField(f.id)} className="text-n400 hover:text-coral-600" aria-label="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {open && <FieldOptions field={f} onChange={(p) => updateField(f.id, p)} />}
              </div>
            );
          })}
          {draft.fields.length === 0 && (
            <div className="rounded-xl border border-dashed border-n300 bg-n50 py-10 text-center text-[12.5px] text-n500">
              No fields yet — add one below.
            </div>
          )}
        </div>

        {/* Add field menu */}
        <div className="mt-3 rounded-xl border border-n200 bg-card p-3">
          <div className="text-[11px] uppercase tracking-[0.5px] text-n500 font-semibold mb-2">Add field</div>
          <div className="flex flex-wrap gap-1.5">
            {FIELD_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => addField(t)}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-n200 bg-card hover:bg-n100 text-[12px] text-n700"
              >
                <Plus className="h-3 w-3" /> {FIELD_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setBlankConfirm(true)}>
            <FilePlus className="h-3.5 w-3.5 mr-1.5" /> New blank form
          </Button>
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset to template
          </Button>
          <Button
            size="sm"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate(draft)}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Save className="h-3.5 w-3.5 mr-1.5" /> {save.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      </div>

      {/* Live preview */}
      <div className="lg:sticky lg:top-4 self-start">
        <div className="text-[11px] uppercase tracking-[0.5px] text-n500 font-semibold mb-2">Live preview</div>
        <div
          className="rounded-2xl p-5 border shadow-sm"
          style={{
            backgroundColor: draft.theme.surface,
            color: draft.theme.text,
            borderColor: draft.theme.mode === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
          }}
        >
          <h2 className="text-[18px] font-semibold" style={{ color: draft.theme.text }}>{draft.title || "Untitled"}</h2>
          {draft.subtitle && (
            <p className="text-[12.5px] mt-0.5 opacity-60" style={{ color: draft.theme.text }}>{draft.subtitle}</p>
          )}
          <div className="mt-4">
            <DynamicFeedbackForm
              fields={draft.fields}
              values={previewValues}
              onChange={(id, v) => setPreviewValues((s) => ({ ...s, [id]: v }))}
              theme={draft.theme.mode}
              themeOverrides={draft.theme}
            />
          </div>
          <button
            disabled
            className="mt-5 w-full h-11 rounded-xl text-[13.5px] font-semibold cursor-not-allowed text-white"
            style={{ backgroundColor: draft.theme.accent, opacity: 0.85 }}
          >
            {draft.submit_label || "Submit"}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={blankConfirm}
        onOpenChange={setBlankConfirm}
        title="Start a blank form?"
        description="This replaces the current draft with an empty form. Your saved version stays unchanged until you click Save."
        confirmLabel="Start blank"
        onConfirm={startBlank}
      />
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 rounded-md border border-n200 bg-card cursor-pointer"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 h-9 rounded-md border border-n300 bg-card px-2 text-[12px] font-mono uppercase focus:outline-none focus:border-orange-400"
        />
      </div>
    </Field>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-[0.5px] text-n500 font-semibold mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function FieldOptions({ field, onChange }: { field: FeedbackField; onChange: (p: Partial<FeedbackField>) => void }) {
  if (field.type === "textarea" || field.type === "text") {
    return (
      <div className="border-t border-n100 px-3 py-3 grid grid-cols-2 gap-3">
        <Field label="Placeholder">
          <input
            value={(field as any).placeholder || ""}
            onChange={(e) => onChange({ placeholder: e.target.value } as any)}
            className="w-full h-8 rounded-md border border-n200 bg-card px-2 text-[12.5px] focus:outline-none focus:border-orange-400"
          />
        </Field>
        {field.type === "textarea" && (
          <Field label="Min characters">
            <input
              type="number"
              min={0}
              value={(field as any).minChars ?? 0}
              onChange={(e) => onChange({ minChars: Number(e.target.value) || 0 } as any)}
              className="w-full h-8 rounded-md border border-n200 bg-card px-2 text-[12.5px] focus:outline-none focus:border-orange-400"
            />
          </Field>
        )}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <OptionsEditor
        title="Dropdown options"
        rows={(field.options || []).map((o) => ({ a: o.value, b: o.label }))}
        labels={["Value", "Label"]}
        onChange={(rows) => onChange({ options: rows.map((r) => ({ value: r.a, label: r.b })) } as any)}
      />
    );
  }

  if (field.type === "vibe") {
    return (
      <OptionsEditor
        title="Vibe buttons"
        rows={(field.options || []).map((o) => ({ a: String(o.value), b: o.emoji, c: o.label }))}
        labels={["Value", "Emoji", "Label"]}
        cols={3}
        onChange={(rows) => onChange({ options: rows.map((r) => ({ value: Number(r.a) || 0, emoji: r.b, label: r.c || "" })) } as any)}
      />
    );
  }

  if (field.type === "rating_group") {
    return (
      <OptionsEditor
        title="Rating rows"
        rows={(field.options || []).map((o) => ({ a: o.key, b: o.label, c: o.helper || "" }))}
        labels={["Key", "Label", "Helper"]}
        cols={3}
        onChange={(rows) => onChange({ options: rows.map((r) => ({ key: r.a, label: r.b, helper: r.c || undefined })) } as any)}
      />
    );
  }

  if (field.type === "toggle_group") {
    return (
      <OptionsEditor
        title="Toggle rows"
        rows={(field.options || []).map((o) => ({ a: o.key, b: o.label, c: o.helper || "" }))}
        labels={["Key", "Label", "Helper"]}
        cols={3}
        onChange={(rows) => onChange({ options: rows.map((r) => ({ key: r.a, label: r.b, helper: r.c || undefined })) } as any)}
      />
    );
  }

  return null;
}

function OptionsEditor({
  title, rows, labels, cols = 2, onChange,
}: {
  title: string;
  rows: { a: string; b: string; c?: string }[];
  labels: string[];
  cols?: 2 | 3;
  onChange: (rows: { a: string; b: string; c?: string }[]) => void;
}) {
  const update = (i: number, patch: Partial<{ a: string; b: string; c: string }>) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  };
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () => onChange([...rows, { a: "", b: "", c: cols === 3 ? "" : undefined }]);

  const grid = cols === 3 ? "grid-cols-[1fr_1fr_1fr_28px]" : "grid-cols-[1fr_1fr_28px]";
  return (
    <div className="border-t border-n100 px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.5px] text-n500 font-semibold mb-2">{title}</div>
      <div className={cn("grid gap-1.5 text-[10.5px] uppercase tracking-[0.5px] text-n400 mb-1", grid)}>
        {labels.map((l) => <span key={l}>{l}</span>)}
        <span />
      </div>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className={cn("grid gap-1.5 items-center", grid)}>
            <input value={r.a} onChange={(e) => update(i, { a: e.target.value })}
              className="h-8 rounded-md border border-n200 px-2 text-[12.5px] focus:outline-none focus:border-orange-400" />
            <input value={r.b} onChange={(e) => update(i, { b: e.target.value })}
              className="h-8 rounded-md border border-n200 px-2 text-[12.5px] focus:outline-none focus:border-orange-400" />
            {cols === 3 && (
              <input value={r.c || ""} onChange={(e) => update(i, { c: e.target.value })}
                className="h-8 rounded-md border border-n200 px-2 text-[12.5px] focus:outline-none focus:border-orange-400" />
            )}
            <button onClick={() => remove(i)} className="text-n400 hover:text-coral-600" aria-label="Remove">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button onClick={add} className="mt-2 inline-flex items-center gap-1 h-7 px-2 rounded-md border border-n200 hover:bg-n100 text-[11.5px] text-n700">
        <Plus className="h-3 w-3" /> Add option
      </button>
    </div>
  );
}
