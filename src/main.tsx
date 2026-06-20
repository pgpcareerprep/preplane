import { createRoot } from "react-dom/client";
import { Component, type ErrorInfo, type ReactNode } from "react";
import App from "./App.tsx";
import { redirectToCanonicalOriginIfNeeded } from "./lib/appOrigin.ts";
import "./index.css";

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[RootErrorBoundary]", error, info);
  }
  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div style={{ fontFamily: "monospace", padding: "2rem", maxWidth: "640px", margin: "0 auto" }}>
          <h2 style={{ color: "#c0392b" }}>Something went wrong</h2>
          <pre style={{ background: "#f5f5f5", padding: "1rem", overflow: "auto", fontSize: "13px" }}>
            {error.message}
            {"\n\n"}
            {error.stack}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: "1rem", padding: "0.5rem 1rem" }}>
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

redirectToCanonicalOriginIfNeeded();

createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
