import { useMemo } from "react";
import { useReducedMotion, type Transition } from "framer-motion";

/**
 * Returns Framer Motion presets that collapse to instant, opacity-only
 * animations when the user prefers reduced motion.
 *
 * Usage:
 *   const m = useMotionPreset();
 *   <motion.div initial={m.fadeUp.initial} animate={m.fadeUp.animate} transition={m.fadeUp.transition(index)} />
 */
export function useMotionPreset() {
  const reduce = useReducedMotion();

  return useMemo(() => {
    const t = (transition: Transition): Transition =>
      reduce ? { duration: 0.03 } : transition;

    const fadeUpInitial = reduce ? { opacity: 0 } : { opacity: 0, y: 8 };
    const fadeUpAnimate = reduce ? { opacity: 1 } : { opacity: 1, y: 0 };

    return {
      reduce,
      /** Staggered fade-up entrance (KPIs, timeline rows). */
      fadeUp: {
        initial: fadeUpInitial,
        animate: fadeUpAnimate,
        transition: (index = 0): Transition =>
          reduce
            ? { duration: 0.03 }
            : { duration: 0.22, delay: index * 0.04, ease: [0, 0, 0.2, 1] },
      },
      /** Drag preview fade for kanban cards. */
      dragFade: {
        initial: reduce ? { opacity: 0 } : { opacity: 0, y: 6 },
        transition: (isDragging: boolean): Transition =>
          reduce ? { duration: 0.03 } : { duration: 0.18 },
        animate: (isDragging: boolean) =>
          reduce
            ? { opacity: isDragging ? 0.4 : 1 }
            : { opacity: isDragging ? 0.4 : 1, y: 0 },
      },
      /** Height-expand for inline forms / accordions. */
      heightExpand: {
        initial: reduce ? { opacity: 0 } : { height: 0, opacity: 0 },
        animate: reduce ? { opacity: 1 } : { height: "auto" as const, opacity: 1 },
        exit:    reduce ? { opacity: 0 } : { height: 0, opacity: 0 },
        transition: t({ duration: 0.35, ease: [0.22, 1, 0.36, 1] }),
      },
      /** Spring slide-in for new list items (e.g. posted remarks). */
      springIn: {
        initial: reduce ? { opacity: 0 } : { opacity: 0, y: 20 },
        animate: reduce ? { opacity: 1 } : { opacity: 1, y: 0 },
        transition: reduce
          ? ({ duration: 0.03 } as Transition)
          : ({ type: "spring" as const, stiffness: 220, damping: 22 } as Transition),
      },
    };
  }, [reduce]);
}