import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

const GAP = 6;
const MAX_W = 280;
const MIN_W = 180;

/**
 * Compact "i" button that shows an explanation popover on hover AND click.
 * Renders the popover in a portal so it is not clipped by overflow-hidden parents.
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
  const [pinned, setPinned] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; transform: string } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const tipRef = useRef<HTMLSpanElement | null>(null);

  const updateCoords = () => {
    const anchor = wrapRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const tipEl = tipRef.current;
    const tipW = tipEl?.offsetWidth ?? MAX_W;
    const tipH = tipEl?.offsetHeight ?? 48;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;

    let placement = side;
    if (placement === "top" && rect.top - tipH - GAP < margin) placement = "bottom";
    if (placement === "bottom" && rect.bottom + tipH + GAP > vh - margin) placement = "top";

    let top = 0;
    let left = 0;
    let transform = "";

    if (placement === "bottom") {
      top = rect.bottom + GAP;
      left = align === "start" ? rect.left : align === "end" ? rect.right : rect.left + rect.width / 2;
      transform = align === "center" ? "translateX(-50%)" : align === "end" ? "translateX(-100%)" : "";
    } else if (placement === "left") {
      top = rect.top + rect.height / 2;
      left = rect.left - GAP;
      transform = "translate(-100%, -50%)";
    } else if (placement === "right") {
      top = rect.top + rect.height / 2;
      left = rect.right + GAP;
      transform = "translateY(-50%)";
    } else {
      top = rect.top - GAP;
      left = align === "start" ? rect.left : align === "end" ? rect.right : rect.left + rect.width / 2;
      transform = align === "center" ? "translate(-50%, -100%)" : align === "end" ? "translate(-100%, -100%)" : "translateY(-100%)";
    }

    const halfW = tipW / 2;
    if (align === "center" || placement === "top" || placement === "bottom") {
      left = Math.min(Math.max(left, margin + (align === "center" ? halfW : 0)), vw - margin - (align === "center" ? halfW : tipW));
    }
    top = Math.min(Math.max(top, margin), vh - margin);

    setCoords({ top, left, transform });
  };

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updateCoords();
    const id = requestAnimationFrame(updateCoords);
    const onScrollOrResize = () => updateCoords();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, side, align, text]);

  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || tipRef.current?.contains(target)) return;
      setPinned(false);
      setOpen(false);
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

  const tooltip = open && typeof document !== "undefined"
    ? createPortal(
      <span
        ref={tipRef}
        role="tooltip"
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        className="fixed z-[9999] rounded-md border px-2.5 py-1.5 text-[11.5px] leading-snug shadow-md pointer-events-auto normal-case"
        style={{
          top: coords?.top ?? -9999,
          left: coords?.left ?? -9999,
          transform: coords?.transform,
          visibility: coords ? "visible" : "hidden",
          background: "var(--lx-surface, white)",
          color: "var(--lx-text, #1A1916)",
          borderColor: "var(--lx-border, rgba(0,0,0,0.08))",
          maxWidth: MAX_W,
          minWidth: MIN_W,
          whiteSpace: "normal",
        }}
      >
        {text}
      </span>,
      document.body,
    )
    : null;

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
      {tooltip}
    </span>
  );
}
