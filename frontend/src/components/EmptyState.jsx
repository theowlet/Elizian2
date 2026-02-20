import React from "react";

/**
 * Illustrated empty state with optional CTA.
 * Use in BookingHistory, HomePage (no deals), Messaging, NotificationCenter.
 */
export default function EmptyState({
  title = "Nothing here yet",
  message,
  actionLabel,
  onAction,
  icon = "✨",
  className = "",
}) {
  return (
    <div
      className={`empty-state-illustrated ${className}`.trim()}
      style={{
        padding: "2rem 1.5rem",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.75rem",
      }}
    >
      <span style={{ fontSize: "2.5rem", opacity: 0.9 }} role="img" aria-hidden>{icon}</span>
      <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>{title}</h3>
      {message && (
        <p style={{ margin: 0, color: "var(--muted, #6b7280)", fontSize: "0.9375rem", maxWidth: 320 }}>
          {message}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          style={{
            marginTop: "0.5rem",
            padding: "10px 20px",
            fontSize: "0.9375rem",
            fontWeight: 600,
            backgroundColor: "var(--primary, #5E17EB)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
