import { motion } from "framer-motion";
import { Calendar, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Session, STATUS_META } from "@/lib/session";

export function SessionCard({
  session, sessions, index, onComplete, onNoShow, onReschedule, onCancel, onFillFeedback, onSendReminder, readOnly = false,
}: {
  session: Session;
  sessions?: Session[]; // when present and length > 1, render grouped variant
  index: number;
  onComplete: () => void;
  onNoShow: () => void;
  onReschedule: () => void;
  onCancel: () => void;
  onFillFeedback: () => void;
  onSendReminder: () => void;
  readOnly?: boolean;
}) {
  const meta = STATUS_META[session.status];
  const isGroup = !!sessions && sessions.length > 1;
  const candidates = isGroup ? sessions!.map((s) => s.candidate) : [session.candidate];
  const visibleAvatars = candidates.slice(0, 3);
  const overflow = candidates.length - visibleAvatars.length;

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      className="relative rounded-xl bg-card border border-n200 shadow-sm p-5 hover:shadow-md transition-all duration-220"
    >
      <div className="absolute top-4 right-4 flex items-center gap-1.5">
        {isGroup && (
          <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 text-orange-600 px-2 py-0.5 text-[11px] font-medium">
            <Users className="h-3 w-3" /> 1:many
          </span>
        )}
        <span className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
          meta.chip,
        )}>
          {meta.pulse && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-75 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-orange-500" />
            </span>
          )}
          {meta.label}
        </span>
      </div>

      <div className="flex items-center gap-2 pr-36">
        <Avatar p={session.mentor} size={32} />
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-n900 truncate">{session.mentor.name}</div>
          {session.mentor.role && (
            <div className="text-[12px] text-n500 truncate">{session.mentor.role} @ {session.mentor.company}</div>
          )}
        </div>
        <span className="text-n300 mx-1">·</span>
        {isGroup ? (
          <>
            <div className="flex -space-x-2">
              {visibleAvatars.map((c, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-full flex items-center justify-center font-semibold shrink-0 ring-2 ring-white",
                    c.color,
                  )}
                  style={{ width: 28, height: 28, fontSize: 11 }}
                  title={c.name}
                >
                  {c.initials}
                </div>
              ))}
              {overflow > 0 && (
                <div
                  className="rounded-full flex items-center justify-center font-semibold shrink-0 ring-2 ring-white bg-n100 text-n700"
                  style={{ width: 28, height: 28, fontSize: 11 }}
                >
                  +{overflow}
                </div>
              )}
            </div>
            <span className="text-[13px] text-n700 font-medium truncate ml-1">
              {candidates.length} candidates
            </span>
          </>
        ) : (
          <>
            <Avatar p={session.candidate} size={28} />
            <span className="text-[13px] text-n700 font-medium truncate">{session.candidate.name}</span>
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-[13px] text-n700">
          <Calendar className="h-3.5 w-3.5 text-n400" />
          {session.dateLabel}
        </span>
        <span className="rounded-full bg-n100 px-2.5 py-0.5 text-[11px] text-n700 font-medium">
          Round: {session.round}
        </span>
      </div>

      {!readOnly && <div className="mt-4 flex flex-wrap items-center gap-2">
        {session.status === "scheduled" && (
          <>
            <Btn variant="primary-sage" onClick={onComplete}>Mark Complete</Btn>
            <Btn variant="ghost-coral" onClick={onNoShow}>Mark No-show</Btn>
            <Btn variant="secondary" onClick={onReschedule}>Reschedule</Btn>
            <Btn variant="danger" onClick={onCancel}>Cancel</Btn>
          </>
        )}
        {session.status === "completed" && (
          <Btn variant="primary" onClick={onFillFeedback}>Fill Feedback →</Btn>
        )}
        {session.status === "feedback-pending" && (
          <>
            <Btn variant="secondary" onClick={onSendReminder}>Send Reminder</Btn>
            <span className="text-[12px] text-n500 ml-auto">
              POC <span className="text-sage-600">✓</span> · Student <span className="text-yellow-600">pending ⏳</span>
            </span>
          </>
        )}
        {session.status === "no-show" && (
          <Btn variant="secondary" onClick={onReschedule}>Reschedule</Btn>
        )}
        {session.status === "rescheduled" && (
          <span className="text-[12px] text-n500">Awaiting new session start</span>
        )}
        {session.status === "closed" && (
          <Btn variant="ghost" onClick={() => {}}>View Summary</Btn>
        )}
      </div>}
    </motion.article>
  );
}

function Avatar({ p, size }: { p: { initials: string; color: string }; size: number }) {
  return (
    <div
      className={cn("rounded-full flex items-center justify-center font-semibold shrink-0", p.color)}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {p.initials}
    </div>
  );
}

function Btn({
  children, onClick, variant,
}: {
  children: React.ReactNode; onClick: () => void;
  variant: "primary" | "primary-sage" | "secondary" | "ghost" | "ghost-coral" | "danger";
}) {
  const cls = {
    "primary":       "bg-orange-500 hover:bg-orange-600 text-white",
    "primary-sage":  "bg-sage-600 hover:bg-sage-400 text-white",
    "secondary":     "bg-card border border-n300 text-n700 hover:bg-n100",
    "ghost":         "text-n600 hover:bg-n100",
    "ghost-coral":   "text-coral-600 hover:bg-coral-50",
    "danger":        "text-coral-600 hover:bg-coral-50",
  }[variant];
  return (
    <button onClick={onClick} className={cn("h-9 px-3 rounded-md text-[12px] font-medium transition-colors", cls)}>
      {children}
    </button>
  );
}
