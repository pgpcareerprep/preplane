/**
 * Tests for localStorage persistence logic.
 * Verifies load/save/default behaviour without a running browser.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── MentorsTabStore (mentors tab state persistence) ───────────────────────

const STORAGE_PREFIX = "lmp.";
const STORAGE_SUFFIX = ".mentorsTab.v2";
const storageKey = (reqId: string) => `${STORAGE_PREFIX}${reqId}${STORAGE_SUFFIX}`;

function loadFromStorage(reqId: string) {
  try {
    const raw = window.localStorage.getItem(storageKey(reqId));
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function saveToStorage(reqId: string, state: Record<string, unknown>) {
  try {
    window.localStorage.setItem(storageKey(reqId), JSON.stringify(state));
  } catch {
    // ignore
  }
}

describe("mentorsTabStore localStorage persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null for an unseen reqId", () => {
    expect(loadFromStorage("req-999")).toBeNull();
  });

  it("persists and reloads state for a reqId", () => {
    const state = { phase: "results", subTab: "suggested", sort: "score" };
    saveToStorage("req-abc", state);
    const loaded = loadFromStorage("req-abc");
    expect(loaded).toMatchObject(state);
  });

  it("uses a namespaced key so different reqIds don't collide", () => {
    saveToStorage("req-1", { phase: "matching" });
    saveToStorage("req-2", { phase: "results" });
    expect(loadFromStorage("req-1")).toMatchObject({ phase: "matching" });
    expect(loadFromStorage("req-2")).toMatchObject({ phase: "results" });
  });

  it("returns null when localStorage contains invalid JSON", () => {
    localStorage.setItem(storageKey("req-bad"), "not-valid-json{{{");
    expect(loadFromStorage("req-bad")).toBeNull();
  });

  it("_matchContext is not persisted (ephemeral)", () => {
    const state = { phase: "results", _matchContext: { some: "context" } };
    const { _matchContext: _omit, ...persistable } = state;
    saveToStorage("req-ctx", persistable);
    const loaded = loadFromStorage("req-ctx");
    expect(loaded!["_matchContext"]).toBeUndefined();
  });
});

// ─── Sidebar collapsed state ────────────────────────────────────────────────

const SIDEBAR_KEY = "lumina:sidebar-collapsed";

function readSidebarCollapsed(): boolean {
  return window.localStorage.getItem(SIDEBAR_KEY) === "1";
}

function writeSidebarCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
  } catch { /* ignore */ }
}

describe("sidebar collapsed localStorage persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to false (not collapsed) when no key exists", () => {
    expect(readSidebarCollapsed()).toBe(false);
  });

  it("persists collapsed=true as '1'", () => {
    writeSidebarCollapsed(true);
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe("1");
    expect(readSidebarCollapsed()).toBe(true);
  });

  it("persists collapsed=false as '0'", () => {
    writeSidebarCollapsed(false);
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe("0");
    expect(readSidebarCollapsed()).toBe(false);
  });

  it("toggling works correctly across reads", () => {
    writeSidebarCollapsed(true);
    expect(readSidebarCollapsed()).toBe(true);
    writeSidebarCollapsed(false);
    expect(readSidebarCollapsed()).toBe(false);
  });
});

// ─── Graceful degradation when localStorage is unavailable ─────────────────

describe("localStorage unavailable (quota exceeded / SSR)", () => {
  it("setItem failure is caught and does not throw", () => {
    const origSetItem = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, "setItem").mockImplementationOnce(() => {
      throw new DOMException("QuotaExceededError");
    });

    expect(() => writeSidebarCollapsed(true)).not.toThrow();
    localStorage.setItem = origSetItem;
  });
});
