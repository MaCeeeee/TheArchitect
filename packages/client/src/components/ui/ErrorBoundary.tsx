import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, showDetails: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error, showDetails } = this.state;

    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--surface-base)]">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
            <AlertTriangle size={32} className="text-red-400" />
          </div>

          <h1
            className="mb-2 text-xl font-semibold text-[var(--text-primary)]"
            style={{ textShadow: '0 0 10px rgba(0,255,65,0.3)' }}
          >
            Something went wrong
          </h1>
          <p className="mb-6 text-sm text-[var(--text-secondary)]">
            An unexpected error occurred. You can try again or reload the page.
          </p>

          <div className="flex items-center justify-center gap-3 mb-6">
            <button
              onClick={this.handleRetry}
              className="rounded-lg bg-[#00ff41] px-4 py-2 text-sm font-medium text-black shadow-[0_0_15px_rgba(0,255,65,0.3)] hover:bg-[#00cc33] transition"
            >
              Try Again
            </button>
            <button
              onClick={this.handleReload}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[#1a2a1a] transition"
            >
              <RefreshCw size={14} />
              Reload Page
            </button>
          </div>

          {error && (
            <div>
              <button
                onClick={() => this.setState({ showDetails: !showDetails })}
                className="flex items-center gap-1 mx-auto text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition"
              >
                {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {showDetails ? 'Hide' : 'Show'} error details
              </button>
              {showDetails && (
                <pre className="mt-3 max-h-40 overflow-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3 text-left text-xs text-red-400/80 font-mono">
                  {error.message}
                  {error.stack && `\n\n${error.stack}`}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
}
