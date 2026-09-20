import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * A render error used to produce a blank white page, which tells the person
 * nothing and leaves no trace to debug from. Show the message instead.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };

  static getDerivedStateFromError(err: unknown) {
    return { message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("Form Check crashed:", err, info.componentStack);
  }

  render() {
    if (this.state.message === null) return this.props.children;
    return (
      <main className="app">
        <h1>Form Check stopped</h1>
        <p className="sub">
          Something threw while drawing the page. Reloading usually clears it. On a phone this is
          most often the browser running out of memory.
        </p>
        <pre className="crash mono">{this.state.message}</pre>
        <p>
          <button className="primary" onClick={() => window.location.reload()}>Reload</button>
        </p>
      </main>
    );
  }
}
