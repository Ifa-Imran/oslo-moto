"use client";

import { Component, type ReactNode } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { IceButton } from "@/components/ui/IceButton";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-oslo-void">
          <GlassCard className="max-w-md w-full text-center p-8 border-oslo-danger/20">
            <AlertTriangle className="w-12 h-12 text-oslo-danger mx-auto mb-4" />
            <h2 className="text-xl font-medium text-oslo-text-primary mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-oslo-text-secondary mb-2">
              An unexpected error occurred while rendering this section.
            </p>
            {this.state.error && (
              <p className="text-xs font-mono text-oslo-danger bg-oslo-danger-dim rounded-lg p-3 mb-6 break-all">
                {this.state.error.message || "Unknown error"}
              </p>
            )}
            <div className="flex gap-3 justify-center">
              <IceButton onClick={this.handleReset} size="sm">
                <RefreshCw className="w-4 h-4 mr-1" />
                Try Again
              </IceButton>
              <IceButton
                variant="ghost"
                size="sm"
                onClick={() => window.location.reload()}
              >
                Reload Page
              </IceButton>
            </div>
          </GlassCard>
        </div>
      );
    }

    return this.props.children;
  }
}
