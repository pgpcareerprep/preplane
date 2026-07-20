import { useEffect, useRef, useState, type ReactNode } from "react";

/** Mount children only when near the viewport — defers heavy data hooks below the fold. */
export function DeferredWhenVisible({
  children,
  minHeight = 280,
  placeholder,
}: {
  children: ReactNode;
  minHeight?: number;
  placeholder?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={ref} style={visible ? undefined : { minHeight }}>
      {visible
        ? children
        : placeholder ?? (
          <div
            className="animate-pulse rounded-xl border"
            style={{ minHeight, borderColor: "var(--lx-border)", background: "var(--lx-soft)" }}
            aria-hidden
          />
        )}
    </div>
  );
}
