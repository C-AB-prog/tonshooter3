import React from "react";
import "../styles/components.css";
import { ApiUser } from "../lib/api";

export function EnergyBar({ user }: { user: ApiUser }) {
  const pct = Math.max(0, Math.min(100, (user.energy / user.energyMax) * 100));

  return (
    <div className="card energyCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div
          style={{
            fontWeight: 900,
            fontSize: "17px",
            background: "linear-gradient(135deg, var(--text-bright), var(--green2))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Энергия
        </div>
        <span className="pill" style={{ fontSize: 14 }}>
          ⚡ {user.energy}/{user.energyMax}
        </span>
      </div>

      <div className="energyBar">
        <div className="energyFill" style={{ width: `${pct}%` }} />
      </div>

      <div className="energyText">
        {pct >= 80 && "Готов к бою! 🔥"}
        {pct >= 50 && pct < 80 && "Энергия в порядке ⚡"}
        {pct >= 20 && pct < 50 && "Энергия снижается 🔋"}
        {pct < 20 && "Нужна подзарядка! 🔴"}
      </div>
    </div>
  );
}
