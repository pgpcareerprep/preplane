import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/** sessionStorage flag — cleared on successful boot in main.tsx */
export const CHUNK_RELOAD_KEY = "preplane:chunk-reload";

export function isStaleChunkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("Loading chunk") ||
    msg.includes("ChunkLoadError") ||
    msg.includes("error loading dynamically imported module")
  );
}

/** One-shot full reload when a hashed Vite chunk 404s after deploy. */
export function reloadForStaleChunk(): never {
  if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
    window.location.reload();
  } else {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  }
  return new Promise(() => {}) as never;
}

/** Wrap a dynamic import so stale post-deploy chunks trigger a single reload. */
export function importWithChunkReload<T>(loader: () => Promise<T>): () => Promise<T> {
  return () =>
    loader().catch((error: unknown) => {
      if (isStaleChunkError(error)) {
        reloadForStaleChunk();
      }
      throw error;
    });
}

/** React.lazy + automatic reload on missing route chunks. */
export function lazyPage<T extends ComponentType<unknown>>(
  loader: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(importWithChunkReload(loader));
}
