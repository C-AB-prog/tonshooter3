import React from "react";
import "../styles/components.css";
import { ApiUser } from "../lib/api";

function fmtInt(s: string) {
  const n = BigInt(s);
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function TopCard({ user }: { user: ApiUser }) {
  const initials = (user.firstName?.[0] ?? "И") + (user.lastName?.[0] ?? "");

  return (
    <div className="card topCard">
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0, flex: 1 }}>
        <div className="avatar" aria-hidden>
          {initials.toUpperCase()}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div
              style={{
                fontWeight: 900,
                fontSize: "19px",
                letterSpacing: "-0.2px",
                color: "var(--text-bright)",
                textShadow: "0 0 10px rgba(77, 124, 255, 0.3)",
              }}
            >
              {user.username ? `@${user.username}` : "Игрок"}
            </div>
            <span className="pill">
              <span style={{ opacity: 0.7 }}>W</span> {user.weaponLevel} · <span style={{ opacity: 0.7 }}>R</span>{" "}
              {user.rangeLevel}
            </span>
          </div>

          <div className="balanceRow">
            <div className="balanceItem">
              <span style={{ fontSize: 16 }}>🪙</span> {fmtInt(user.coins)}
            </div>
            <div className="balanceItem">
              <span style={{ fontSize: 16 }}>💎</span> {fmtInt(user.crystals)}
            </div>
            <div className="balanceItem">
              <span style={{ fontSize: 16 }}>🔷</span> {user.tonBalance}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
