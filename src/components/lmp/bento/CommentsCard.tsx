import { useState } from "react";
import { Send } from "lucide-react";
import { addComment, formatRelativeTime, useComments } from "@/lib/lmpExecutionEngine";

export function CommentsCard({ lmpId, compact = false }: { lmpId: string; compact?: boolean }) {
  const items = useComments(lmpId);
  const [text, setText] = useState("");

  const submit = () => {
    if (!text.trim()) return;
    addComment(lmpId, text.trim());
    setText("");
  };

  const visible = compact ? items.slice(0, 3) : items;

  return (
    <div className="rounded-2xl bg-card border border-n200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[13px] font-semibold text-n800">Comments</h4>
        <span className="text-[11px] text-n400">Internal discussion</span>
      </div>

      {visible.length === 0 ? (
        <div className="text-[12px] text-n400 italic py-3 text-center">
          No comments yet.
        </div>
      ) : (
        <ul className="space-y-3 mb-3">
          {visible.map((c) => (
            <li key={c.id} className="flex gap-2">
              <span
                className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ${c.authorColor}`}
              >
                {c.authorInitials}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-n500">
                  <span className="font-semibold text-n800">{c.author}</span> · {formatRelativeTime(c.ts)}
                </div>
                <div className="text-[12.5px] text-n800 leading-snug">{c.text}</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Write a comment…"
          className="flex-1 h-8 rounded-md border border-n200 bg-card px-2.5 text-[12.5px] focus:outline-none focus:border-orange-300"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim()}
          className="h-8 w-8 rounded-md bg-n900 text-white inline-flex items-center justify-center disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}