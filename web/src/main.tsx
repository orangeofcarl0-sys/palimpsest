import { Component, type ReactNode } from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

/** Render-crash boundary: a failed panel must show its error, not a blank page. */
class CrashShield extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: unknown): { error: Error } {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }
  override render(): ReactNode {
    if (this.state.error !== null) {
      return <pre style={{ color: "#f87171", padding: 16, whiteSpace: "pre-wrap" }}>渲染崩溃：{String(this.state.error.stack ?? this.state.error)}</pre>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CrashShield>
      <App />
    </CrashShield>
  </StrictMode>,
);
