import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Route/panel-specific label, e.g. "policy data" → "Unable to load policy data." */
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Application error boundary. Holds error state ONLY for the subtree it
 * wraps — no global error state. Key the instance by the current route
 * (e.g. <ErrorBoundary key={pathname}>) so each panel gets its own fresh
 * failure lifecycle and a crash never contaminates another panel.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  private reset = () => this.setState({ hasError: false, message: "" });

  render() {
    if (!this.state.hasError) return this.props.children;
    const subject = this.props.label ?? "this section";
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-lg border border-danger/30 bg-danger-soft/20 p-6 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-soft">
          <AlertTriangle className="h-5 w-5 text-danger" />
        </div>
        <div className="text-sm font-semibold">Unable to load {subject}</div>
        <div className="max-w-md text-xs text-muted-foreground">
          An unexpected error occurred while rendering this panel. The rest of the application continues to work.
        </div>
        {this.state.message && (
          <code className="max-w-md truncate rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground" title={this.state.message}>
            {this.state.message}
          </code>
        )}
        <Button size="sm" variant="outline" onClick={this.reset}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }
}
