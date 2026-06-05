// Shared types & defaults for editable feedback form templates.

export type Audience = "student" | "poc";

export type VibeOption = { value: number; emoji: string; label: string };
export type RatingGroupRow = { key: string; label: string; helper?: string };
export type ToggleGroupRow = { key: string; label: string; helper?: string };
export type SelectOption = { value: string; label: string };

export type FeedbackField =
  | { id: string; type: "vibe"; label: string; required?: boolean; helpText?: string; options: VibeOption[] }
  | { id: string; type: "rating"; label: string; required?: boolean; helpText?: string }
  | { id: string; type: "rating_group"; label: string; required?: boolean; helpText?: string; options: RatingGroupRow[] }
  | { id: string; type: "toggle_group"; label: string; required?: boolean; helpText?: string; options: ToggleGroupRow[] }
  | { id: string; type: "textarea"; label: string; required?: boolean; helpText?: string; placeholder?: string; minChars?: number }
  | { id: string; type: "text"; label: string; required?: boolean; helpText?: string; placeholder?: string }
  | { id: string; type: "toggle"; label: string; required?: boolean; helpText?: string }
  | { id: string; type: "select"; label: string; required?: boolean; helpText?: string; options: SelectOption[] }
  | { id: string; type: "confirm"; label: string; required?: boolean };

export type FieldType = FeedbackField["type"];

export type FeedbackTheme = {
  mode: "dark" | "light";
  accent: string;
  surface: string;
  text: string;
};

export type FeedbackTemplate = {
  audience: Audience;
  title: string;
  subtitle: string;
  submit_label: string;
  fields: FeedbackField[];
  theme: FeedbackTheme;
};

export function defaultTheme(audience: Audience): FeedbackTheme {
  return audience === "student"
    ? { mode: "dark", accent: "#F97316", surface: "#141414", text: "#FFFFFF" }
    : { mode: "dark", accent: "#F97316", surface: "#141414", text: "#FFFFFF" };
}

export function blankTemplate(audience: Audience): FeedbackTemplate {
  return {
    audience,
    title: "Untitled form",
    subtitle: "",
    submit_label: "Submit",
    fields: [],
    theme: defaultTheme(audience),
  };
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  vibe: "Emoji vibe (5)",
  rating: "Star rating",
  rating_group: "Rating group",
  toggle_group: "Toggle group",
  textarea: "Long text",
  text: "Short text",
  toggle: "Yes/no toggle",
  select: "Dropdown",
  confirm: "Confirmation checkbox",
};

const uid = () => Math.random().toString(36).slice(2, 9);

export function makeDefaultField(type: FieldType): FeedbackField {
  const id = `${type}_${uid()}`;
  switch (type) {
    case "vibe":
      return {
        id, type, label: "Overall vibe", required: true,
        options: [
          { value: 1, emoji: "😞", label: "Not great" },
          { value: 2, emoji: "😐", label: "Okay" },
          { value: 3, emoji: "🙂", label: "Good" },
          { value: 4, emoji: "😄", label: "Great" },
          { value: 5, emoji: "🤩", label: "Excellent" },
        ],
      };
    case "rating":
      return { id, type, label: "Rating", required: true };
    case "rating_group":
      return {
        id, type, label: "Rate your mentor", required: true,
        options: [
          { key: "clarity", label: "Clarity" },
          { key: "responsiveness", label: "Responsiveness" },
          { key: "relevance", label: "Relevance" },
        ],
      };
    case "toggle_group":
      return {
        id, type, label: "Your call", required: true,
        options: [
          { key: "engage_again", label: "Worth engaging again", helper: "You'd ping them for the next batch" },
          { key: "good_fit", label: "Good fit for students", helper: "You'd confidently assign them a mentee" },
        ],
      };
    case "textarea":
      return { id, type, label: "Comments", required: false, placeholder: "Share your thoughts…" };
    case "text":
      return { id, type, label: "Short answer", required: false };
    case "toggle":
      return { id, type, label: "Would recommend", required: false };
    case "select":
      return {
        id, type, label: "Outcome", required: true,
        options: [
          { value: "good", label: "Good" },
          { value: "ok", label: "OK" },
          { value: "bad", label: "Bad" },
        ],
      };
    case "confirm":
      return { id, type, label: "I confirm this is accurate", required: true };
  }
}

export const STUDENT_TEMPLATE_FALLBACK: FeedbackTemplate = {
  audience: "student",
  title: "How was your session?",
  subtitle: "Takes 2 minutes · helps us match you better",
  submit_label: "Submit feedback",
  fields: [
    makeDefaultField("vibe"),
    makeDefaultField("rating_group"),
    { ...(makeDefaultField("textarea") as any), label: "Any comments?", required: false, placeholder: "Share anything about the session — what went well, what could be better, or anything else on your mind." },
    { ...(makeDefaultField("toggle") as any), label: "Would recommend this mentor" },
    { ...(makeDefaultField("confirm") as any), label: "I confirm this session took place and the feedback is genuine" },
  ],
  theme: defaultTheme("student"),
};

export const POC_TEMPLATE_FALLBACK: FeedbackTemplate = {
  audience: "poc",
  title: "Mentor Evaluation",
  subtitle: "Post-session · internal only",
  submit_label: "Submit",
  fields: [
    {
      ...(makeDefaultField("rating_group") as any),
      label: "How did the mentor show up?",
      required: true,
      options: [
        { key: "prep_readiness", label: "Prep Readiness", helper: "Was the mentor able to impart relevant prep for the co and role?" },
        { key: "student_interaction", label: "Student Interaction", helper: "Was he/she able to engage and answer student questions?" },
      ],
    },
    {
      ...(makeDefaultField("toggle_group") as any),
      label: "Your call",
      required: false,
      options: [
        { key: "engage_again", label: "Worth engaging again", helper: "You'd ping them for the next batch" },
        { key: "good_fit", label: "Good fit for students", helper: "You'd confidently assign them a mentee" },
      ],
    },
    {
      ...(makeDefaultField("textarea") as any),
      label: "Anything to note?",
      required: false,
      placeholder: "Concerns, standout moments, or things to remember for next time…",
    },

  ],
  theme: defaultTheme("poc"),
};

export function fallbackTemplate(audience: Audience): FeedbackTemplate {
  return audience === "student" ? STUDENT_TEMPLATE_FALLBACK : POC_TEMPLATE_FALLBACK;
}

export function initialValues(fields: FeedbackField[]): Record<string, any> {
  const v: Record<string, any> = {};
  for (const f of fields) {
    switch (f.type) {
      case "vibe": v[f.id] = null; break;
      case "rating": v[f.id] = 0; break;
      case "rating_group":
        v[f.id] = Object.fromEntries(f.options.map((o) => [o.key, 0]));
        break;
      case "toggle_group":
        v[f.id] = Object.fromEntries(f.options.map((o) => [o.key, false]));
        break;
      case "textarea":
      case "text":
      case "select":
        v[f.id] = "";
        break;
      case "toggle":
      case "confirm":
        v[f.id] = false;
        break;
    }
  }
  return v;
}

export function validateValues(fields: FeedbackField[], values: Record<string, any>): boolean {
  for (const f of fields) {
    if (!f.required) continue;
    const v = values[f.id];
    switch (f.type) {
      case "vibe":
        if (v == null) return false; break;
      case "rating":
        if (!v || v <= 0) return false; break;
      case "rating_group":
        if (!v || (f as any).options.some((o: RatingGroupRow) => !v[o.key] || v[o.key] <= 0)) return false;
        break;
      case "toggle_group":
        if (!v || (f as any).options.some((o: ToggleGroupRow) => v[o.key] !== true)) return false;
        break;
      case "textarea":
      case "text": {
        const min = (f as any).minChars ?? 1;
        if (typeof v !== "string" || v.trim().length < min) return false;
        break;
      }
      case "select":
        if (!v) return false; break;
      case "toggle":
        if (v !== true) return false; break;
      case "confirm":
        if (v !== true) return false; break;
    }
  }
  return true;
}
