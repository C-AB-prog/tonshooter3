import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../store/useSession";
import { apiFetch } from "../lib/api";
import { Overlay } from "../components/Overlay";

export default function Profile() {
  const nav = useNavigate();
  const { user, token, logout } = useSession();
  const [ref, setRef] = useState<{ payload: string; referralCount: number } | null>(null);
  const [overlay, setOverlay] = useState<{ title: string; text: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      const r = await apiFetch<{ payload: string; referralCount: number }>("/profile/referral", { token });
      setRef(r);
    })();
  }, [token]);

  if (!user || !token) return null;

  const botUsername = (import.meta.env.VITE_BOT_USERNAME as string) || "";
  const referralLink = ref && botUsername ? `https://t.me/${botUsername}?startapp=${ref.payload}` : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(referralLink);
      setOverlay({ title: "Скопировано", text: "Ссылка скопирована." });
    } catch {
      setOverlay({ title: "Не удалось", text: referralLink || "Проверь VITE_BOT_USERNAME" });
    }
  }

  const inputStyle: React.CSSProperties = {
    minHeight: 44,
    padding: "0 12px",
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "rgba(255,255,255,0.92)",
    fontWeight: 800,
    outline: "none",
  };

  return (
    <div className="safe col">
      <div className="h1">Профиль</div>

      {/* ресурсы сразу */}
      <div className="card" style={{ padding: 14 }}>
        <div className="balanceRow">
          <div className="balanceItem">🪙 {user.coins}</div>
          <div className="balanceItem">💎 {user.crystals}</div>
          <div className="balanceItem">🔷 {user.tonBalance}</div>
          <div className="balanceItem">⚡ {user.energy}/{user.energyMax}</div>
        </div>
      </div>

      {/* рефералка */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Рефералка</div>
          <span className="pill">{user.canWithdrawTon ? "✅" : "🔒"}</span>
        </div>

        {/* условие одной строкой */}
        <div className="muted" style={{ marginTop: 6, fontWeight: 800, fontSize: 12 }}>
          Условие: 50 выстрелов и 20 попаданий за 24 часа
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <input value={referralLink || (botUsername ? "" : "Нужно настроить VITE_BOT_USERNAME")} readOnly style={{ ...inputStyle, flex: 1 }} />
          <button className="btn btnGreen" onClick={copy} disabled={!referralLink}>
            Копировать
          </button>
        </div>

        <div className="balanceRow" style={{ marginTop: 12 }}>
          <div className="balanceItem">Всего: {ref?.referralCount ?? "—"}</div>
          <div className="balanceItem">Активных: {user.activeReferralCount}</div>
        </div>
      </div>

      <button className="btn btnPrimary" style={{ width: "100%" }} onClick={() => nav("/wallet")}>
        Кошелёк
      </button>

      {user.isAdmin ? (
        <button className="btn btnSoft" style={{ width: "100%" }} onClick={() => nav("/admin")}>
          Админка
        </button>
      ) : null}

      <button className="btn btnSoft" style={{ width: "100%" }} onClick={logout}>
        Выйти
      </button>

      {overlay ? <Overlay title={overlay.title} text={overlay.text} onClose={() => setOverlay(null)} /> : null}
    </div>
  );
}
