import { useState, useEffect, useRef } from "react";
import { Bell, Clock, Save, Loader2, Send, Mail, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useRole } from "@/lib/rolesContext";
import { useUserNotifications } from "@/lib/hooks/useUserNotifications";
import { useNavigate } from "react-router-dom";

const ALL_DAYS = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
] as const;

type ReminderSchedule = {
  time: string; // "HH:MM:SS" 24h
  timezone: string;
  days: string[];
  enabled: boolean;
};

const DEFAULT_SCHEDULE: ReminderSchedule = {
  time: "11:00:00",
  timezone: "Asia/Kolkata",
  days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  enabled: true,
};

// ---------- Time conversion helpers ----------
function parse24(time: string): { h: number; m: number; s: number } {
  const parts = (time || "00:00:00").split(":").map((x) => parseInt(x, 10) || 0);
  return { h: parts[0] ?? 0, m: parts[1] ?? 0, s: parts[2] ?? 0 };
}
function to12(time: string) {
  const { h, m, s } = parse24(time);
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { hour: hour12, minute: m, second: s, period };
}
function to24(hour: number, minute: number, second: number, period: "AM" | "PM"): string {
  let h = hour % 12;
  if (period === "PM") h += 12;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(minute)}:${pad(second)}`;
}
function format12Display(time: string) {
  const { hour, minute, second, period } = to12(time);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${hour}:${pad(minute)}:${pad(second)} ${period}`;
}

// ---------- Time Picker ----------
function TimePicker12({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { hour, minute, second, period } = to12(value);

  // Local draft strings allow free typing (incl. clearing & multi-digit entry)
  const [hStr, setHStr] = useState(hour.toString().padStart(2, "0"));
  const [mStr, setMStr] = useState(minute.toString().padStart(2, "0"));
  const [sStr, setSStr] = useState(second.toString().padStart(2, "0"));
  const [focused, setFocused] = useState<"h" | "m" | "s" | null>(null);

  // Resync drafts from value when not actively editing that field
  useEffect(() => {
    if (focused !== "h") setHStr(hour.toString().padStart(2, "0"));
    if (focused !== "m") setMStr(minute.toString().padStart(2, "0"));
    if (focused !== "s") setSStr(second.toString().padStart(2, "0"));
  }, [hour, minute, second, focused]);

  const clamp = (n: number, min: number, max: number) =>
    Math.min(max, Math.max(min, isNaN(n) ? min : n));

  const commitAll = (h: number, m: number, s: number, p: "AM" | "PM") => {
    onChange(to24(clamp(h, 1, 12), clamp(m, 0, 59), clamp(s, 0, 59), p));
  };

  const fieldClass =
    "h-9 w-12 rounded-md border border-n200 bg-card px-2 text-center text-[13px] text-n800 tabular-nums focus:outline-none focus:border-orange-300";

  const onTypeHour = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    setHStr(digits);
    if (digits === "") return;
    const num = parseInt(digits, 10);
    if (digits.length === 2 || num > 1) {
      // commit as soon as further typing can't add a valid digit
      commitAll(num, minute, second, period);
    }
  };

  const onTypeMinSec = (
    raw: string,
    kind: "m" | "s",
  ) => {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    if (kind === "m") setMStr(digits);
    else setSStr(digits);
    if (digits === "") return;
    if (digits.length < 2) return;
    const num = parseInt(digits, 10);
    if (kind === "m") commitAll(hour, num, second, period);
    else commitAll(hour, minute, num, period);
  };

  const blurField = (kind: "h" | "m" | "s") => {
    setFocused(null);
    if (kind === "h") {
      const n = clamp(parseInt(hStr || "1", 10), 1, 12);
      setHStr(n.toString().padStart(2, "0"));
      commitAll(n, minute, second, period);
    } else if (kind === "m") {
      const n = clamp(parseInt(mStr || "0", 10), 0, 59);
      setMStr(n.toString().padStart(2, "0"));
      commitAll(hour, n, second, period);
    } else {
      const n = clamp(parseInt(sStr || "0", 10), 0, 59);
      setSStr(n.toString().padStart(2, "0"));
      commitAll(hour, minute, n, period);
    }
  };

  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-n200 bg-card px-2 py-1.5">
      {/* Hour */}
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={hStr}
        onFocus={(e) => { setFocused("h"); e.currentTarget.select(); }}
        onChange={(e) => onTypeHour(e.target.value)}
        onBlur={() => blurField("h")}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            commitAll(hour === 12 ? 1 : hour + 1, minute, second, period);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            commitAll(hour === 1 ? 12 : hour - 1, minute, second, period);
          }
        }}
        className={fieldClass}
        aria-label="Hour"
      />
      <span className="text-n500 text-[13px] font-medium">:</span>
      {/* Minute */}
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={mStr}
        onFocus={(e) => { setFocused("m"); e.currentTarget.select(); }}
        onChange={(e) => onTypeMinSec(e.target.value, "m")}
        onBlur={() => blurField("m")}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            commitAll(hour, minute === 59 ? 0 : minute + 1, second, period);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            commitAll(hour, minute === 0 ? 59 : minute - 1, second, period);
          }
        }}
        className={fieldClass}
        aria-label="Minute"
      />
      <span className="text-n500 text-[13px] font-medium">:</span>
      {/* Second */}
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={sStr}
        onFocus={(e) => { setFocused("s"); e.currentTarget.select(); }}
        onChange={(e) => onTypeMinSec(e.target.value, "s")}
        onBlur={() => blurField("s")}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            commitAll(hour, minute, second === 59 ? 0 : second + 1, period);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            commitAll(hour, minute, second === 0 ? 59 : second - 1, period);
          }
        }}
        className={fieldClass}
        aria-label="Second"
      />
      {/* AM/PM segmented */}
      <div className="ml-1 inline-flex rounded-md border border-n200 overflow-hidden">
        {(["AM", "PM"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => commitAll(hour, minute, second, p)}
            className={cn(
              "h-7 px-2.5 text-[12px] font-semibold transition-colors",
              period === p
                ? "bg-orange-500 text-white"
                : "bg-card text-n500 hover:text-n700",
            )}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

type EmailDiagnostic = {
  delegatedUser: string;
  serviceAccountEmail: string | null;
  serviceAccountClientId: string | null;
  hasSaEmail: boolean;
  hasPrivateKey: boolean;
  hasSmtpPassword: boolean;
  hasOAuthClient: boolean;
  hasOAuthClientId: boolean;
  hasOAuthClientSecret: boolean;
  hasOAuthRefreshToken: boolean;
  oauthAuthorized: boolean;
  oauthSenderEmail: string | null;
  oauthError: string | null;
  oauthRedirectUri: string;
  saKeyValid: boolean;
  saKeyError: string | null;
  gmailDelegationAuthorized: boolean;
  gmailDelegationError: string | null;
  fixSteps: string[];
};

const GMAIL_OAUTH_CALLBACK_KEY = "preplane_gmail_oauth_callback";
const handledOAuthCallbackStates = new Set<string>();

export default function NotificationsPage() {
  const { role } = useRole();
  const canEdit = role === "admin" || role === "allocator";
  const isAdmin = role === "admin";
  const [schedule, setSchedule] = useState<ReminderSchedule>(DEFAULT_SCHEDULE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [emailDiag, setEmailDiag] = useState<EmailDiagnostic | null>(null);
  const [emailReady, setEmailReady] = useState<boolean | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [oauthStarting, setOauthStarting] = useState(false);
  const oauthCallbackStartedRef = useRef(false);

  const loadEmailDiagnostic = async () => {
    if (!isAdmin) return;
    setDiagLoading(true);
    try {
      const { data } = await supabase.functions.invoke("email-auth-diagnose");
      if (data?.diagnostic) setEmailDiag(data.diagnostic as EmailDiagnostic);
      if (typeof data?.readyToSend === "boolean") setEmailReady(data.readyToSend);
    } finally {
      setDiagLoading(false);
    }
  };

  const completeGmailOAuth = async (code: string, state: string) => {
    setOauthConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("gmail-oauth-complete", {
        body: { code, state },
      });
      if (error) {
        toast.error("Gmail connect failed: " + error.message);
        return;
      }
      if (!data?.ok) {
        const errText = data?.error || "Unknown error";
        if (errText.includes("Invalid or expired OAuth state")) {
          const { data: recheck } = await supabase.functions.invoke("email-auth-diagnose");
          if (recheck?.diagnostic?.oauthAuthorized) {
            setEmailReady(true);
            if (recheck.diagnostic) setEmailDiag(recheck.diagnostic as EmailDiagnostic);
            toast.success("Gmail connected", {
              description: recheck.diagnostic?.oauthSenderEmail
                ? `Sending as ${recheck.diagnostic.oauthSenderEmail}`
                : undefined,
            });
            return;
          }
        }
        toast.error("Gmail connect failed", { description: errText });
        return;
      }
      toast.success("Gmail connected", {
        description: data.senderEmail ? `Sending as ${data.senderEmail}` : undefined,
      });
      setEmailReady(true);
      await loadEmailDiagnostic();
    } catch (e: unknown) {
      toast.error("Gmail connect failed: " + String((e as Error)?.message || e));
    } finally {
      setOauthConnecting(false);
    }
  };

  const startGmailOAuth = async () => {
    setOauthStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke("gmail-oauth-start");
      if (error) {
        toast.error("Could not start Gmail connect: " + error.message);
        return;
      }
      if (!data?.ok || !data?.url) {
        toast.error("Could not start Gmail connect", { description: data?.error || "Unknown error" });
        return;
      }
      window.location.href = data.url as string;
    } catch (e: unknown) {
      toast.error("Could not start Gmail connect: " + String((e as Error)?.message || e));
    } finally {
      setOauthStarting(false);
    }
  };

  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any)
        .from("system_settings")
        .select("value")
        .eq("key", "reminder_schedule")
        .single();
      if (!error && data?.value) {
        setSchedule(data.value as ReminderSchedule);
      }
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.email) setTestEmail(userData.user.email);
      setLoading(false);
    })();
    void loadEmailDiagnostic();
  }, [isAdmin]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (code && state) {
      sessionStorage.setItem(GMAIL_OAUTH_CALLBACK_KEY, JSON.stringify({ code, state, ts: Date.now() }));
    }
  }, []);

  useEffect(() => {
    if (!isAdmin || oauthConnecting || oauthCallbackStartedRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    if (oauthError) {
      oauthCallbackStartedRef.current = true;
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
      toast.error("Google authorization failed", {
        description: params.get("error_description") || oauthError,
        duration: 12000,
      });
      return;
    }

    let code = params.get("code");
    let state = params.get("state");

    if (!code || !state) {
      const saved = sessionStorage.getItem(GMAIL_OAUTH_CALLBACK_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as { code?: string; state?: string; ts?: number };
          if (parsed.ts && Date.now() - parsed.ts < 10 * 60 * 1000 && parsed.code && parsed.state) {
            code = parsed.code;
            state = parsed.state;
          } else {
            sessionStorage.removeItem(GMAIL_OAUTH_CALLBACK_KEY);
          }
        } catch {
          sessionStorage.removeItem(GMAIL_OAUTH_CALLBACK_KEY);
        }
      }
    }

    if (!code || !state) return;
    if (handledOAuthCallbackStates.has(state)) return;

    oauthCallbackStartedRef.current = true;
    handledOAuthCallbackStates.add(state);
    sessionStorage.setItem(GMAIL_OAUTH_CALLBACK_KEY, JSON.stringify({ code, state, ts: Date.now() }));

    window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    void completeGmailOAuth(code, state).finally(() => {
      sessionStorage.removeItem(GMAIL_OAUTH_CALLBACK_KEY);
    });
  }, [isAdmin, oauthConnecting]);

  const toggleDay = (day: string) => {
    setSchedule((s) => ({
      ...s,
      days: s.days.includes(day) ? s.days.filter((d) => d !== day) : [...s.days, day],
    }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    const { error } = await (supabase as any)
      .from("system_settings")
      .update({ value: schedule, updated_at: new Date().toISOString() })
      .eq("key", "reminder_schedule");
    setSaving(false);
    if (error) {
      toast.error("Failed to save: " + error.message);
    } else {
      toast.success("Reminder schedule saved");
      setDirty(false);
    }
  };

  const sendTest = async () => {
    if (!testEmail || !testEmail.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }
    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-test-reminder-email", {
        body: { to: testEmail },
      });
      if (error) {
        toast.error("Failed: " + error.message);
      } else if (data?.ok) {
        setEmailReady(true);
        void loadEmailDiagnostic();
        toast.success(`Test email sent to ${data.to}`, {
          description: `Delivered via ${data.method || "gmail-api"}. Check inbox (and spam folder).`,
        });
      } else {
        if (data?.diagnostic) {
          setEmailDiag(data.diagnostic as EmailDiagnostic);
          setEmailReady(false);
        }
        const hint = data?.fixHint || data?.diagnostic?.fixSteps?.[0];
        toast.error("Email delivery failed", {
          description: hint ? `${data?.error}\n\n${hint}` : (data?.error || "Unknown error"),
          duration: 12000,
        });
      }
    } catch (e: any) {
      toast.error("Request failed: " + (e?.message || String(e)));
    } finally {
      setSendingTest(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-n400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h3 className="text-[24px] font-semibold tracking-[-0.5px] text-n900">Notifications</h3>
        <p className="text-[13px] text-n500 mt-1">
          Your in-app feed and progress reminder email settings.
        </p>
      </header>

      <UserNotificationFeed />

      {!canEdit && (
        <div className="rounded-lg border border-n200 bg-n50 px-4 py-3 text-[13px] text-n600">
          Read-only view. Notification configuration can be changed by admins and allocators.
        </div>
      )}

      {/* Reminder Schedule Card */}
      <fieldset disabled={!canEdit} className={cn("rounded-xl bg-card border border-n200 shadow-sm overflow-hidden", !canEdit && "opacity-80")}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-n200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-orange-50 text-orange-500 grid place-items-center">
              <Bell className="h-4.5 w-4.5" strokeWidth={1.5} />
            </div>
            <div>
              <h4 className="text-[15px] font-semibold text-n900">Progress Reminder Schedule</h4>
              <p className="text-[12px] text-n500">Email reminders for overdue daily progress updates</p>
            </div>
          </div>
          {/* Enable toggle */}
          <button
            type="button"
            onClick={() => { setSchedule((s) => ({ ...s, enabled: !s.enabled })); setDirty(true); }}
            className={cn(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              schedule.enabled ? "bg-orange-500" : "bg-n300",
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 rounded-full bg-card shadow transition-transform",
                schedule.enabled ? "translate-x-6" : "translate-x-1",
              )}
            />
          </button>
        </div>

        <div className={cn("px-5 py-5 space-y-5", !schedule.enabled && "opacity-50 pointer-events-none")}>
          {/* Time picker */}
          <div>
            <label className="block text-[13px] font-medium text-n700 mb-2">
              <Clock className="inline h-3.5 w-3.5 mr-1.5 text-n500" />
              Reminder Time
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              <TimePicker12
                value={schedule.time}
                onChange={(next) => {
                  setSchedule((s) => ({ ...s, time: next }));
                  setDirty(true);
                }}
              />
              <span className="text-[12px] text-n500 bg-n50 border border-n200 rounded-md px-2.5 py-1.5">
                IST (Asia/Kolkata)
              </span>
            </div>
            <p className="text-[11px] text-n400 mt-1.5">
              Reminders will be sent at this time to POCs who have not updated progress by the next expected date.
            </p>
          </div>

          {/* Day selector */}
          <div>
            <label className="block text-[13px] font-medium text-n700 mb-2">
              Active Days
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_DAYS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleDay(key)}
                  className={cn(
                    "h-9 min-w-[56px] rounded-lg border text-[13px] font-medium transition-colors",
                    schedule.days.includes(key)
                      ? "bg-orange-50 border-orange-300 text-orange-700"
                      : "bg-card border-n200 text-n500 hover:border-n300 hover:text-n700",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-n400 mt-1.5">
              Reminders will only be sent on selected days. Weekends are excluded by default.
            </p>
          </div>

          {/* Summary */}
          <div className="rounded-lg bg-n50/60 border border-n200 px-4 py-3">
            <p className="text-[12.5px] text-n700">
              <span className="font-medium">Current schedule:</span>{" "}
              {schedule.enabled ? (
                <>
                  Reminders fire at <span className="font-semibold text-orange-600">{format12Display(schedule.time)} IST</span> on{" "}
                  <span className="font-semibold">
                    {schedule.days.length === 7
                      ? "every day"
                      : schedule.days.length === 0
                      ? "no days (paused)"
                      : schedule.days.map((d) => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(", ")}
                  </span>
                </>
              ) : (
                <span className="text-n500">Reminders are disabled</span>
              )}
            </p>
          </div>
        </div>

        {/* Save button */}
        <div className="px-5 py-3 border-t border-n200 bg-n50/40 flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg bg-n900 text-white text-[13px] font-medium hover:bg-n800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Schedule
          </button>
        </div>
      </fieldset>

      {/* Email delivery status (admin) */}
      {isAdmin && (
        <div className={cn(
          "rounded-xl border shadow-sm overflow-hidden",
          emailReady ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200",
        )}>
          <div className="px-5 py-4 flex items-start gap-3">
            {diagLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-n500 mt-0.5" />
            ) : emailReady ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <h4 className="text-[15px] font-semibold text-n900">
                {diagLoading ? "Checking email configuration…" : emailReady ? "Email delivery configured" : "Email delivery not configured"}
              </h4>
              {!diagLoading && emailDiag?.hasOAuthClient && !emailDiag.oauthAuthorized && (
                <p className="mt-2 text-[13px] font-medium text-amber-900 bg-amber-100/80 border border-amber-200 rounded-lg px-3 py-2">
                  Step 2 required: secrets are set, but Gmail is not connected yet. Click <strong>Connect Gmail sender</strong> below and sign in as{" "}
                  <code className="text-[11px]">{emailDiag.delegatedUser}</code>.
                </p>
              )}
              {!diagLoading && emailDiag && !emailReady && (
                <div className="mt-2 space-y-2 text-[12px] text-n700 leading-relaxed">
                  {emailDiag.oauthSenderEmail && (
                    <p>OAuth sender: <code className="text-[11px] bg-white/60 px-1 rounded">{emailDiag.oauthSenderEmail}</code></p>
                  )}
                  {emailDiag.serviceAccountEmail && (
                    <p>Service account: <code className="text-[11px] bg-white/60 px-1 rounded">{emailDiag.serviceAccountEmail}</code></p>
                  )}
                  <p>Sender mailbox: <code className="text-[11px] bg-white/60 px-1 rounded">{emailDiag.delegatedUser}</code></p>
                  {emailDiag.hasOAuthClientId && !emailDiag.hasOAuthClientSecret && (
                    <p className="text-amber-800">OAuth client ID is set; client secret is missing in Supabase secrets.</p>
                  )}
                  {!emailDiag.hasOAuthClientId && emailDiag.hasOAuthClientSecret && (
                    <p className="text-amber-800">OAuth client secret is set; client ID is missing in Supabase secrets.</p>
                  )}
                  {emailDiag.oauthError && (
                    <p className="text-amber-800">Gmail OAuth: {emailDiag.oauthError}</p>
                  )}
                  {emailDiag.gmailDelegationError && (
                    <p className="text-amber-800">Gmail delegation: {emailDiag.gmailDelegationError}</p>
                  )}
                  <ol className="list-decimal list-inside space-y-1 mt-2">
                    {emailDiag.fixSteps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                  {!emailDiag.oauthAuthorized && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => void startGmailOAuth()}
                        disabled={oauthStarting || oauthConnecting || !emailDiag.hasOAuthClient}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-n900 text-white text-[12px] font-medium hover:bg-n800 transition-colors disabled:opacity-40"
                      >
                        {(oauthStarting || oauthConnecting) ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Mail className="h-3.5 w-3.5" />
                        )}
                        {oauthConnecting ? "Connecting Gmail…" : "Connect Gmail sender"}
                      </button>
                      {!emailDiag.hasOAuthClient && (
                        <p className="mt-1.5 text-[11px] text-amber-800">
                          Set both GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in Supabase secrets first.
                        </p>
                      )}
                      <p className="mt-1.5 text-[11px] text-n600">
                        Redirect URI: <code className="bg-white/60 px-1 rounded">{emailDiag.oauthRedirectUri}</code>
                      </p>
                    </div>
                  )}
                  {!emailDiag.hasOAuthClient && !emailDiag.hasSmtpPassword && (
                    <p className="mt-2 font-medium text-n800">
                      Or set a Google App Password for {emailDiag.delegatedUser}, then run{" "}
                      <code className="text-[11px] bg-white/60 px-1 rounded">npx supabase secrets set GMAIL_APP_PASSWORD=your-app-password --project-ref sgqwnjajvgjcwqergnsr</code>
                    </p>
                  )}
                </div>
              )}
              {!diagLoading && emailDiag && emailReady && emailDiag.oauthAuthorized && (
                <p className="mt-1 text-[12px] text-n700">
                  Sending via Gmail OAuth as{" "}
                  <code className="text-[11px] bg-white/60 px-1 rounded">{emailDiag.oauthSenderEmail}</code>
                </p>
              )}
            </div>
            {!diagLoading && (
              <button
                type="button"
                onClick={() => void loadEmailDiagnostic()}
                className="text-[12px] text-n600 hover:text-n900 underline shrink-0"
              >
                Refresh
              </button>
            )}
          </div>
        </div>
      )}

      {/* Test email delivery */}
      {canEdit && <div className="rounded-xl bg-card border border-n200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-n200 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-sky-50 text-sky-600 grid place-items-center">
            <Mail className="h-4.5 w-4.5" strokeWidth={1.5} />
          </div>
          <div>
            <h4 className="text-[15px] font-semibold text-n900">Test email delivery</h4>
            <p className="text-[12px] text-n500">Send a test email immediately to verify Gmail SMTP credentials</p>
          </div>
        </div>
        <div className="px-5 py-5 flex items-center gap-3">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="recipient@example.com"
            className="h-9 flex-1 max-w-md rounded-lg border border-n200 bg-card px-3 text-[13px] text-n800 focus:outline-none focus:border-orange-300"
          />
          <button
            type="button"
            onClick={sendTest}
            disabled={sendingTest}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-orange-500 text-white text-[13px] font-medium hover:bg-orange-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sendingTest ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send test email
          </button>
        </div>
      </div>}

      {/* Recent reminder activity */}
      <ReminderActivityPanel />

      {/* Info */}
      <div className="rounded-lg border border-dashed border-n300 bg-card p-5">
        <p className="text-[13px] text-n600 leading-relaxed">
          <strong>How it works:</strong> When a POC sets a "Next expected progress" date on an LMP process,
          the system checks at the scheduled time whether any progress update has been logged.
          If not, a reminder email is sent to the assigned POC. Changing the next progress date
          automatically cancels any previous reminder.
        </p>
      </div>
    </div>
  );
}

function UserNotificationFeed() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead, markAllRead, isLoading } = useUserNotifications();

  return (
    <div className="rounded-xl bg-card border border-n200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-n200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-orange-50 text-orange-500 grid place-items-center">
            <Bell className="h-4.5 w-4.5" strokeWidth={1.5} />
          </div>
          <div>
            <h4 className="text-[15px] font-semibold text-n900">Your notifications</h4>
            <p className="text-[12px] text-n500">
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllRead()}
            className="text-[12px] text-orange-600 hover:underline"
          >
            Mark all read
          </button>
        )}
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {isLoading ? (
          <div className="px-5 py-8 grid place-items-center text-n400">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-n400 italic">
            No notifications yet.
          </div>
        ) : (
          <ul className="divide-y divide-n100">
            {notifications.map((n) => {
              const unread = !n.read_at;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (unread) markRead(n.id);
                      if (n.route) navigate(n.route);
                    }}
                    className={cn(
                      "w-full text-left px-5 py-3 hover:bg-n50 transition-colors",
                      unread && "bg-orange-50/40",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {unread && <span className="mt-1.5 h-2 w-2 rounded-full bg-orange-500 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-n900">{n.title}</div>
                        <div className="text-[12px] text-n600">{n.message}</div>
                        <div className="text-[11px] text-n400 mt-0.5">
                          {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function ReminderActivityPanel() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    const { data: reminders } = await (supabase as any)
      .from("lmp_progress_reminders")
      .select("id, lmp_id, next_progress_date, status, poc_email, sent_at, created_at")
      .order("created_at", { ascending: false })
      .limit(15);
    const lmpIds = Array.from(new Set((reminders ?? []).map((r: any) => r.lmp_id)));
    const lmpMap = new Map<string, { company: string; role: string }>();
    if (lmpIds.length > 0) {
      const { data: lmps } = await supabase
        .from("lmp_processes")
        .select("id, company, role")
        .in("id", lmpIds as any);
      (lmps ?? []).forEach((l: any) => lmpMap.set(l.id, { company: l.company, role: l.role }));
    }
    const merged = (reminders ?? []).map((r: any) => ({
      ...r,
      company: lmpMap.get(r.lmp_id)?.company ?? "—",
      role: lmpMap.get(r.lmp_id)?.role ?? "—",
    }));
    setRows(merged);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("reminders-rt-panel")
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "lmp_progress_reminders" }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const statusColor = (s: string) =>
    s === "sent"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : s === "pending"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : s === "failed"
      ? "bg-red-50 text-red-700 border-red-200"
      : s === "skipped"
      ? "bg-n100 text-n600 border-n200"
      : "bg-amber-50 text-amber-700 border-amber-200";

  return (
    <div className="rounded-xl bg-card border border-n200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-n200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-violet-50 text-violet-600 grid place-items-center">
            <Bell className="h-4.5 w-4.5" strokeWidth={1.5} />
          </div>
          <div>
            <h4 className="text-[15px] font-semibold text-n900">Recent reminder activity</h4>
            <p className="text-[12px] text-n500">Last 15 scheduled and sent reminders</p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-n200 bg-card text-[12px] font-medium text-n700 hover:border-n300 disabled:opacity-40"
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Refresh
        </button>
      </div>
      <div className="overflow-x-auto">
        {loading ? (
          <div className="px-5 py-8 grid place-items-center text-n400">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-n400 italic">
            No reminders scheduled yet.
          </div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead className="bg-n50/60 text-n500 text-[11px] uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-2">LMP</th>
                <th className="text-left font-medium px-4 py-2">Scheduled</th>
                <th className="text-left font-medium px-4 py-2">Status</th>
                <th className="text-left font-medium px-4 py-2">POC email</th>
                <th className="text-left font-medium px-4 py-2">Sent at</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-n100">
                  <td className="px-4 py-2 text-n800">
                    <div className="font-medium">{r.company}</div>
                    <div className="text-n500 text-[11px]">{r.role}</div>
                  </td>
                  <td className="px-4 py-2 tabular-nums text-n700">{r.next_progress_date}</td>
                  <td className="px-4 py-2">
                    <span className={cn("inline-block px-2 py-[1px] rounded-full border text-[11px] font-medium", statusColor(r.status))}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-n700">{r.poc_email || <span className="text-n400 italic">—</span>}</td>
                  <td className="px-4 py-2 tabular-nums text-n600">
                    {r.sent_at ? new Date(r.sent_at).toLocaleString() : <span className="text-n400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
