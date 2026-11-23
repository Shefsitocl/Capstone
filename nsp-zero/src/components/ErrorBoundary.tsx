import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: "",
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error capturado en Kura UI:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="login-shell">
          <div className="login-card">
            <h2 style={{ margin: "0 0 8px", color: "#991B1B" }}>Error inesperado en la interfaz</h2>
            <p style={{ fontSize: 13, color: "#475569", marginBottom: 16 }}>
              {this.state.errorMessage || "Ocurrió un problema al renderizar el panel operativo."}
            </p>
            <button
              type="button"
              className="button primary"
              onClick={() => window.location.reload()}
            >
              Recargar plataforma
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
