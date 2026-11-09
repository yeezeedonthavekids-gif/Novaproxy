import { Component, type ComponentChildren } from "preact";
import { Icon } from "./Icon";

interface State {
  error: Error | null;
}

/** Contains crashes to a single page so one broken module never takes down the whole browser shell. */
export class ErrorBoundary extends Component<{ children: ComponentChildren; name: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[nova] ${this.props.name} crashed:`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div class="error-page">
        <div class="error-card">
          <div class="error-icon">
            <Icon name="alert" size={26} />
          </div>
          <h1>{this.props.name} ran into a problem</h1>
          <p class="muted">The rest of NOVA is unaffected. You can try loading this page again.</p>
          <pre class="error-detail">{String(this.state.error?.message ?? this.state.error)}</pre>
          <button class="btn primary" style={{ marginTop: 16 }} onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}
