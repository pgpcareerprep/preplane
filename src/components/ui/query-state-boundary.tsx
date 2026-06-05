/**
 * QueryStateBoundary
 * ------------------
 * Renders consistent loading / error / empty states around any react-query
 * result. Saves repeating skeleton + error UI on every wired surface.
 *
 * Usage:
 *   const q = useFoo();
 *   <QueryStateBoundary query={q} isEmpty={(d) => !d?.length}>
 *     {(data) => <FooList data={data} />}
 *   </QueryStateBoundary>
 */
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState, type EmptyStateProps } from "./empty-state";

interface QueryLike<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  refetch?: () => void;
}

export interface QueryStateBoundaryProps<T> {
  query: QueryLike<T>;
  isEmpty?: (data: T) => boolean;
  /** Children render only when data is present and not empty. */
  children: (data: T) => React.ReactNode;
  loadingClassName?: string;
  emptyState?: EmptyStateProps;
  /** When true, render a compact spinner (e.g. inside cards). */
  compact?: boolean;
}

export function QueryStateBoundary<T>({
  query,
  isEmpty,
  children,
  loadingClassName,
  emptyState,
  compact,
}: QueryStateBoundaryProps<T>) {
  if (query.isLoading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2 text-n500",
          compact ? "py-4 text-[12px]" : "py-12 text-[13px]",
          loadingClassName,
        )}
      >
        <Loader2 className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4", "animate-spin")} />
        <span>Loading…</span>
      </div>
    );
  }

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "Failed to load data";
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50/50 text-red-700",
          compact ? "p-3 text-[12px]" : "p-6 text-[13px]",
        )}
      >
        <AlertTriangle className={cn(compact ? "h-4 w-4" : "h-5 w-5")} />
        <div className="font-semibold">Couldn't load this data</div>
        <p className="text-red-600/80 text-[12px] max-w-md text-center">{message}</p>
        {query.refetch && (
          <button
            onClick={() => query.refetch?.()}
            className="mt-1 rounded-md bg-card border border-red-200 px-2.5 py-1 text-[11.5px] font-medium hover:bg-red-100"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  const data = query.data;
  if (data === undefined || data === null || (isEmpty && isEmpty(data))) {
    return <EmptyState compact={compact} {...emptyState} />;
  }

  return <>{children(data)}</>;
}
