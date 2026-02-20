import React from "react";

/**
 * React Error Boundary — catches render errors and shows fallback UI.
 * Prevents full app crash; wrap <App> or key route trees.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "60vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            textAlign: "center",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#6b7280", marginBottom: 24 }}>
            We hit an error. Try reloading the page.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: "10px 20px",
              fontSize: "1rem",
              backgroundColor: "#059669",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
