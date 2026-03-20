import React, { useEffect } from "react";
import "../styles/components.css";

type OverlayAction = { label: string; onClick: () => void };

export function Overlay({
  title,
  text,
  onClose,
  action,
  secondaryAction,
}: {
  title: string;
  text: string;
  onClose: () => void;
  action?: OverlayAction;
  secondaryAction?: OverlayAction;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="overlayCard" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontWeight: 900,
                fontSize: "22px",
                letterSpacing: "-0.3px",
                background: "linear-gradient(135deg, var(--text-bright), var(--blue2))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                marginBottom: 12,
              }}
            >
              {title}
            </div>
            <div
              className="muted"
              style={{
                fontWeight: 600,
                whiteSpace: "pre-wrap",
                fontSize: "15px",
                lineHeight: 1.5,
              }}
            >
              {text}
            </div>
          </div>

          <button
            className="btn btnSoft"
            onClick={onClose}
            style={{
              width: 44,
              minWidth: 44,
              height: 44,
              padding: 0,
              borderRadius: 14,
              fontSize: 20,
            }}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
          {action ? (
            <button className="btn btnPrimary" onClick={action.onClick} style={{ width: "100%", minHeight: 52 }}>
              {action.label}
            </button>
          ) : null}

          {secondaryAction ? (
            <button className="btn btnSoft" onClick={secondaryAction.onClick} style={{ width: "100%", minHeight: 52 }}>
              {secondaryAction.label}
            </button>
          ) : null}

          {!action && !secondaryAction && (
            <button className="btn btnPrimary" onClick={onClose} style={{ width: "100%", minHeight: 52 }}>
              Понятно
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
