import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../store/useSession";
import { apiFetch } from "../lib/api";
import { Overlay } from "../components/Overlay";

function fmtBig(s: string) {
  return BigInt(s).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function parsePositiveInt(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  if (t < 1) return null;
  return t;
}

export default function Wallet() {
  const nav = useNavigate();
  const { user, token, refresh } = useSession();
  const [overlay, setOverlay] = useState<{ title: string; text: string } | null>(null);

  // string inputs (so user can clear)
  const [coinsToCrystalsStr, setCoinsToCrystalsStr] = useState("1");
  const [crystalsToTonStr, setCrystalsToTonStr] = useState("1");

  const [withdrawAmount, setWithdrawAmount] = useState("1");
  const [withdrawAddr, setWithdrawAddr] = useState("");

  if (!user || !token) return null;

  const coinsToCrystals = parsePositiveInt(coinsToCrystalsStr) ?? 0;
  const crystalsToTon = parsePositiveInt(crystalsToTonStr) ?? 0;

  const coinsNeed = useMemo(() => BigInt(coinsToCrystals || 0) * 100000n, [coinsToCrystals]);
  const crystalsNeed = useMemo(() => BigInt(crystalsToTon || 0) * 100n, [crystalsToTon]);

  async function exchange(direction: "coins_to_crystals" | "crystals_to_ton", amount: number) {
    try {
      await apiFetch("/exchange", { token, body: { direction, amount } });
      await refresh();
    } catch (e: any) {
      if (e?.code === "not_enough_coins") setOverlay({ title: "Не хватает Coins", text: "Недостаточно Coins." });
      else if (e?.code === "not_enough_crystals") setOverlay({ title: "Не хватает Crystals", text: "Недостаточно Crystals." });
      else setOverlay({ title: "Ошибка", text: "Обмен не выполнен." });
    }
  }

  async function withdraw() {
    const amt = Number(withdrawAmount);
    try {
      await apiFetch("/withdraw", { token, body: { amountTon: amt, address: withdrawAddr } });
      await refresh();
      setOverlay({ title: "Заявка создана", text: "Вывод в очереди." });
    } catch (e: any) {
      const code = e?.code;
      if (code === "withdraw_locked_need_referral") setOverlay({ title: "Закрыто", text: "Нужен 1 активный реферал." });
      else if (code === "min_withdraw_1_ton") setOverlay({ title: "Минимум", text: "Минимум 1 TON." });
      else if (code === "max_withdraw_25_ton") setOverlay({ title: "Максимум", text: "Максимум 25 TON." });
      else if (code === "withdraw_cooldown_24h") setOverlay({ title: "Ограничение", text: "Раз в 24 часа." });
      else if (code === "not_enough_ton") setOverlay({ title: "Не хватает TON", text: "Недостаточно TON." });
      else setOverlay({ title: "Ошибка", text: "Не удалось создать заявку." });
    }
  }

  const locked = !user.canWithdrawTon;

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
      <div className="h1">Кошелёк</div>

      <div className="card" style={{ padding: 14 }}>
        <div className="balanceRow">
          <div className="balanceItem">🪙 {fmtBig(user.coins)}</div>
          <div className="balanceItem">💎 {fmtBig(user.crystals)}</div>
          <div className="balanceItem">🔷 {user.tonBalance}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Coins → Crystals</div>
        <div className="muted" style={{ marginTop: 6, fontWeight: 800, fontSize: 12 }}>
          Нужно: {coinsToCrystals ? fmtBig(coinsNeed.toString()) : "—"}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <input
            value={coinsToCrystalsStr}
            onChange={(e) => setCoinsToCrystalsStr(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            inputMode="numeric"
            placeholder="сколько crystals"
          />
          <button className="btn btnGreen" disabled={!coinsToCrystals} onClick={() => exchange("coins_to_crystals", coinsToCrystals)}>
            Обмен
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Crystals → TON</div>
        <div className="muted" style={{ marginTop: 6, fontWeight: 800, fontSize: 12 }}>
          Нужно: {crystalsToTon ? fmtBig(crystalsNeed.toString()) : "—"}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <input
            value={crystalsToTonStr}
            onChange={(e) => setCrystalsToTonStr(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            inputMode="numeric"
            placeholder="сколько TON"
          />
          <button className="btn btnGreen" disabled={!crystalsToTon} onClick={() => exchange("crystals_to_ton", crystalsToTon)}>
            Обмен
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Вывод TON</div>
          <span className="pill">{locked ? "🔒" : "✅"}</span>
        </div>

        {locked ? (
          <div className="notice" style={{ marginTop: 12 }}>
            Вывод закрыт: нужен <b>1 активный реферал</b>.
            <div style={{ marginTop: 10 }}>
              <button className="btn btnSoft" style={{ width: "100%" }} onClick={() => nav("/profile")}>
                Открыть рефералку
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="muted" style={{ marginTop: 6, fontWeight: 800, fontSize: 12 }}>
              1–25 TON, раз в 24 часа
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <input
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                style={{ ...inputStyle, width: 120 }}
                inputMode="decimal"
                placeholder="TON"
              />
              <input
                value={withdrawAddr}
                onChange={(e) => setWithdrawAddr(e.target.value)}
                placeholder="TON-адрес"
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>

            <button className="btn btnPrimary" style={{ width: "100%", marginTop: 12 }} onClick={withdraw}>
              Создать заявку
            </button>
          </>
        )}
      </div>

      {overlay ? <Overlay title={overlay.title} text={overlay.text} onClose={() => setOverlay(null)} /> : null}
    </div>
  );
}
