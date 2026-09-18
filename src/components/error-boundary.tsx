import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Application error boundary. Shows a professional error state with a
 * Retry action and keeps the rest of the app usable. This is ADDITIONAL
 * safety only — it must never be used to hide data bugs.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
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
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-lg border border-danger/30 bg-danger-soft/20 p-6 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-soft">
          <AlertTriangle className="h-5 w-5 text-danger" />
        </div>
        <div className="text-sm font-semibold">This panel failed to load</div>
        <div className="max-w-md text-xs text-muted-foreground">
          An unexpected error occurred while rendering this section. The rest of the application continues to work.
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
