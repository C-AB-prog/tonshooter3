import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { Overlay } from "../components/Overlay";
import { useSession } from "../store/useSession";

function parseIntOrNull(v: string): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export default function Admin() {
  const nav = useNavigate();
  const { user, token, refresh } = useSession();
  const [overlay, setOverlay] = useState<{ title: string; text: string } | null>(null);

  const [targetTgUserId, setTargetTgUserId] = useState("");
  const [coins, setCoins] = useState("100000");
  const [crystals, setCrystals] = useState("100");
  const [tonBalance, setTonBalance] = useState("1");
  const [weaponLevel, setWeaponLevel] = useState("5");
  const [rangeLevel, setRangeLevel] = useState("5");

  type AdminTask = {
    id: string;
    title: string;
    description: string;
    chatId: string;
    url: string;
    cap: number;
    completedCount: number;
    requireSubscriptionCheck: boolean;
    rewardType: "COINS" | "CRYSTALS";
    rewardValue: number;
    isActive: boolean;
    createdAt: string;
  };

  const [adminTasks, setAdminTasks] = useState<AdminTask[]>([]);
  const [taskTitle, setTaskTitle] = useState("Реклама");
  const [taskDescription, setTaskDescription] = useState("Подпишись и получи награду");
  const [taskChatId, setTaskChatId] = useState("@channel");
  const [taskUrl, setTaskUrl] = useState("https://t.me/channel");
  const [taskRewardType, setTaskRewardType] = useState<"COINS" | "CRYSTALS">("COINS");
  const [taskRewardValue, setTaskRewardValue] = useState("100000");
  const [taskCap, setTaskCap] = useState("10");
  const [taskRequireSub, setTaskRequireSub] = useState(true);

  async function loadAdminTasks() {
    if (!token) return;
    try {
      const res = await apiFetch<{ tasks: AdminTask[] }>("/admin/tasks", { token });
      setAdminTasks(res.tasks);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!token) return;
    void loadAdminTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const targetLabel = useMemo(() => {
    if (!targetTgUserId.trim()) return "себе";
    return `tgUserId=${targetTgUserId.trim()}`;
  }, [targetTgUserId]);

  if (!user || !token) return null;

  const inputStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 44,
    padding: "0 12px",
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "rgba(255,255,255,0.92)",
    fontWeight: 800,
    outline: "none",
  };

  if (!user.isAdmin) {
    return (
      <div className="safe col">
        <div className="card" style={{ padding: 14 }}>
          <div className="h2">Админка</div>
          <button className="btn btnPrimary" style={{ width: "100%", marginTop: 12 }} onClick={() => nav("/profile")}>
            Назад
          </button>
        </div>
      </div>
    );
  }

  async function grant(patch: any, okText: string) {
    try {
      await apiFetch("/admin/grant", {
        token,
        body: {
          ...(targetTgUserId.trim() ? { targetTgUserId: targetTgUserId.trim() } : {}),
          ...patch,
        },
      });
      await refresh();
      setOverlay({ title: "Готово", text: okText });
    } catch (e: any) {
      setOverlay({ title: "Ошибка", text: e?.code ?? "admin_failed" });
    }
  }

  async function doMockPurchase(purchase: "boost" | "upgrade_weapon_5" | "upgrade_range_5") {
    try {
      await apiFetch("/ton/purchase/mock", { token, body: { purchase } });
      await refresh();
      setOverlay({ title: "Успех", text: purchase });
    } catch (e: any) {
      const code = e?.code;
      if (code === "mock_disabled") setOverlay({ title: "Отключено", text: "Mock выключен." });
      else setOverlay({ title: "Ошибка", text: code ?? "mock_purchase_failed" });
    }
  }

  async function createTask() {
    if (!token) return;
    const cap = parseIntOrNull(taskCap);
    const rewardValue = parseIntOrNull(taskRewardValue);
    if (!cap || cap < 1) return setOverlay({ title: "Ошибка", text: "cap >= 1" });
    if (!rewardValue || rewardValue < 1) return setOverlay({ title: "Ошибка", text: "reward >= 1" });
    if (!taskUrl.trim() || !taskChatId.trim()) return setOverlay({ title: "Ошибка", text: "Нужны chatId и url" });

    try {
      await apiFetch("/admin/tasks/create", {
        token,
        body: {
          title: taskTitle.trim(),
          description: taskDescription.trim(),
          chatId: taskChatId.trim(),
          url: taskUrl.trim(),
          rewardType: taskRewardType,
          rewardValue,
          cap,
          requireSubscriptionCheck: taskRequireSub,
        },
      });
      await loadAdminTasks();
      setOverlay({ title: "Готово", text: "Задание создано" });
    } catch (e: any) {
      setOverlay({ title: "Ошибка", text: e?.code ?? "task_create_failed" });
    }
  }

  async function setTaskActive(taskId: string, isActive: boolean) {
    if (!token) return;
    try {
      await apiFetch("/admin/tasks/deactivate", { token, body: { taskId, isActive } });
      await loadAdminTasks();
    } catch (e: any) {
      setOverlay({ title: "Ошибка", text: e?.code ?? "task_toggle_failed" });
    }
  }

  return (
    <div className="safe col">
      <h1 className="h1">Админка</h1>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>Цель: {targetLabel}</div>
        <input
          value={targetTgUserId}
          onChange={(e) => setTargetTgUserId(e.target.value)}
          placeholder="target tgUserId (опц.)"
          style={{ ...inputStyle, marginTop: 12 }}
        />
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>Ресурсы</div>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 140px", gap: 10 }}>
          <input value={coins} onChange={(e) => setCoins(e.target.value)} placeholder="coins" style={inputStyle} />
          <button className="btn btnGreen" onClick={() => grant({ coins: coins }, `+${coins} coins (${targetLabel})`)}>+Coins</button>

          <input value={crystals} onChange={(e) => setCrystals(e.target.value)} placeholder="crystals" style={inputStyle} />
          <button className="btn btnGreen" onClick={() => grant({ crystals: crystals }, `+${crystals} crystals (${targetLabel})`)}>+Crystals</button>

          <input value={tonBalance} onChange={(e) => setTonBalance(e.target.value)} placeholder="tonBalance" style={inputStyle} />
          <button className="btn btnGreen" onClick={() => grant({ tonBalance: tonBalance }, `+${tonBalance} TON (${targetLabel})`)}>+TON</button>
        </div>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>Уровни</div>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <input value={weaponLevel} onChange={(e) => setWeaponLevel(e.target.value)} placeholder="weapon" style={inputStyle} />
          <input value={rangeLevel} onChange={(e) => setRangeLevel(e.target.value)} placeholder="range" style={inputStyle} />
        </div>

        <button
          className="btn btnPrimary"
          style={{ width: "100%", marginTop: 12 }}
          onClick={() =>
            grant(
              {
                ...(parseIntOrNull(weaponLevel) !== null ? { weaponLevel: parseIntOrNull(weaponLevel) } : {}),
                ...(parseIntOrNull(rangeLevel) !== null ? { rangeLevel: parseIntOrNull(rangeLevel) } : {}),
              },
              `Уровни применены (${targetLabel})`
            )
          }
        >
          Применить
        </button>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>Mock TON</div>
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <button className="btn btnPrimary" onClick={() => doMockPurchase("boost")}>boost</button>
          <button className="btn btnSoft" onClick={() => doMockPurchase("upgrade_weapon_5")}>weapon 5</button>
          <button className="btn btnSoft" onClick={() => doMockPurchase("upgrade_range_5")}>range 5</button>
        </div>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>Задания</div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="title" style={inputStyle} />
          <input value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} placeholder="description" style={inputStyle} />
          <input value={taskChatId} onChange={(e) => setTaskChatId(e.target.value)} placeholder="@channel" style={inputStyle} />
          <input value={taskUrl} onChange={(e) => setTaskUrl(e.target.value)} placeholder="https://t.me/..." style={inputStyle} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <select value={taskRewardType} onChange={(e) => setTaskRewardType(e.target.value as any)} style={inputStyle}>
              <option value="COINS">coins</option>
              <option value="CRYSTALS">crystals</option>
            </select>
            <input value={taskRewardValue} onChange={(e) => setTaskRewardValue(e.target.value)} placeholder="reward" style={inputStyle} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "center" }}>
            <input value={taskCap} onChange={(e) => setTaskCap(e.target.value)} placeholder="cap" style={inputStyle} />
            <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 900 }}>
              <input type="checkbox" checked={taskRequireSub} onChange={(e) => setTaskRequireSub(e.target.checked)} />
              sub-check
            </label>
          </div>

          <button className="btn btnPrimary" onClick={createTask}>Создать</button>
          <button className="btn btnSoft" onClick={loadAdminTasks}>Обновить</button>
        </div>

        {adminTasks.length ? (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {adminTasks.map((t) => (
              <div key={t.id} className="card" style={{ padding: 12, background: "rgba(255,255,255,0.70)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ fontWeight: 900 }}>{t.title}</div>
                  <span className="pill">{t.isActive ? "🟢" : "🔴"}</span>
                </div>

                <div className="muted" style={{ marginTop: 6, fontWeight: 800, fontSize: 12 }}>
                  {t.completedCount}/{t.cap} · {t.rewardType === "COINS" ? `🪙 ${t.rewardValue}` : `💎 ${t.rewardValue}`}
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  {t.isActive ? (
                    <button className="btn btnSoft" onClick={() => setTaskActive(t.id, false)}>Off</button>
                  ) : (
                    <button className="btn btnGreen" onClick={() => setTaskActive(t.id, true)}>On</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <button className="btn btnSoft" style={{ width: "100%" }} onClick={() => nav("/profile")}>
        Назад
      </button>

      {overlay ? <Overlay title={overlay.title} text={overlay.text} onClose={() => setOverlay(null)} /> : null}
    </div>
  );
}
