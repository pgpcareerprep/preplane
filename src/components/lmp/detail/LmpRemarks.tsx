import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRole } from "@/lib/rolesContext";
import type { Remark } from "@/lib/lmpDetail";
import { useMotionPreset } from "@/lib/useMotionPreset";

const ROLE_PILL: Record<Remark["role"], string> = {
  Allocator: "bg-orange-100 text-orange-600",
  POC:       "bg-teal-50 text-teal-600",
  Admin:     "bg-plum-400/15 text-plum-400",
};

export function LmpRemarks() {
  const { role, user } = useRole();
  const canPost = true;
  const [items, setItems] = useState<Remark[]>([]);
  const [draft, setDraft] = useState("");
  const m = useMotionPreset();

  const handlePost = () => {
    if (!draft.trim()) return;
    const newRemark: Remark = {
      id: `r-${Date.now()}`,
      author: user?.name ?? "You",
      initials: (user?.name ?? "U").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
      avatarColor: "bg-orange-200 text-orange-600",
      role: role === "admin" ? "Admin" : role === "poc" ? "POC" : "Allocator",
      timestamp: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · " +
        new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
      text: draft.trim(),
    };
    setItems(prev => [newRemark, ...prev]);
    setDraft("");
    toast.success("Remark posted");
  };

  return (
    <section className="rounded-2xl bg-card shadow-sm border border-n200 p-6">
      <h4 className="text-[16px] font-semibold text-n800 mb-4">Remarks</h4>

      {canPost && (
        <div className="flex gap-2 mb-4">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handlePost()}
            placeholder="Add a remark…"
            className="flex-1 rounded-lg border border-n200 bg-n50 px-3 py-2 text-[13px] text-n800 placeholder:text-n400 focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
          <button
            onClick={handlePost}
            disabled={!draft.trim()}
            className="rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-[13px] font-medium px-4 py-2 transition-colors"
          >
            Post
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-[13px] text-n500 italic">No remarks yet.</p>
      ) : (
        <ul className="space-y-4">
          <AnimatePresence>
            {items.map((r, i) => (
              <motion.li
                key={r.id}
                initial={m.fadeUp.initial}
                animate={m.fadeUp.animate}
                transition={m.fadeUp.transition(i)}
              >
                <div className="flex items-start gap-3">
                  <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0", r.avatarColor)}>
                    {r.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[13px] font-medium text-n800">{r.author}</span>
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", ROLE_PILL[r.role])}>
                        {r.role}
                      </span>
                      <span className="text-[11px] text-n400">{r.timestamp}</span>
                    </div>
                    <p className="text-[13px] text-n700 leading-relaxed">{r.text}</p>
                    {r.replies?.map(reply => (
                      <div key={reply.id} className="mt-2 ml-4 pl-3 border-l-2 border-n200">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[12px] font-medium text-n700">{reply.author}</span>
                          <span className="text-[10px] text-n400">{reply.timestamp}</span>
                        </div>
                        <p className="text-[12px] text-n600">{reply.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
