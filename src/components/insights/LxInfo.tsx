import { useState, useRef, useEffect } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Compact "i" button that shows an explanation popover on hover AND click.
 * - Hover (desktop): opens after a small delay, closes on leave.
 * - Click/keyboard: toggles, stays open until explicit close (outside click / Esc).
 * - Click is captured (stopPropagation) so it never triggers parent drill-down handlers.
 */
export function LxInfo({
  text,
  className,
  size = 14,
  side = "top",
  align = "center",
  ariaLabel,
}: {
  text: string;
  className?: string;
  size?: number;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false); // true when opened by click
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  // Close pinned popover when clicking outside or hitting Esc.
  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setPinned(false); setOpen(false); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  const onEnter = () => {
    if (pinned) return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(true), 120);
  };
  const onLeave = () => {
    if (pinned) return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(false), 80);
  };

  // Position offsets based on side.
  const posStyle: React.CSSProperties = (() => {
    if (side === "bottom") return { top: "calc(100% + 6px)", left: align === "start" ? 0 : align === "end" ? "auto" : "50%", right: align === "end" ? 0 : "auto", transform: align === "center" ? "translateX(-50%)" : undefined };
    if (side === "left") return { right: "calc(100% + 6px)", top: "50%", transform: "translateY(-50%)" };
    if (side === "right") return { left: "calc(100% + 6px)", top: "50%", transform: "translateY(-50%)" };
    return { bottom: "calc(100% + 6px)", left: align === "start" ? 0 : align === "end" ? "auto" : "50%", right: align === "end" ? 0 : "auto", transform: align === "center" ? "translateX(-50%)" : undefined };
  })();

  return (
    <span
      ref={wrapRef}
      className={cn("relative inline-flex items-center", className)}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <button
        type="button"
        aria-label={ariaLabel ?? "What does this mean?"}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          const next = !pinned;
          setPinned(next);
          setOpen(next);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => { if (!pinned) setOpen(false); }}
        className="inline-flex items-center justify-center rounded-full opacity-60 hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 transition-opacity"
        style={{ width: size + 4, height: size + 4, color: "var(--lx-text-3)" }}
      >
        <Info style={{ width: size, height: size }} aria-hidden />
      </button>

      {open && (
        <span
          role="tooltip"
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          className="absolute z-50 rounded-md border px-2.5 py-1.5 text-[11.5px] leading-snug shadow-md pointer-events-auto"
          style={{
            ...posStyle,
            background: "var(--lx-surface, white)",
            color: "var(--lx-text, #1A1916)",
            borderColor: "var(--lx-border, rgba(0,0,0,0.08))",
            maxWidth: 280,
            minWidth: 180,
            whiteSpace: "normal",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
