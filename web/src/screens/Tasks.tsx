import React, { useEffect, useState } from "react";
import { useSession } from "../store/useSession";
import { apiFetch } from "../lib/api";
import { Overlay } from "../components/Overlay";

type Task = {
  id: string;
  title: string;
  description: string;
  chatId: string;
  url: string;
  cap: number;
  completedCount: number;
  requireSubscriptionCheck: boolean;
  opened: boolean;
  rewardType: "COINS" | "CRYSTALS";
  rewardValue: number;
  claimed: boolean;
};

function fmtCoins(n: number) {
  return BigInt(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export default function Tasks() {
  const { token, refresh } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [overlay, setOverlay] = useState<{ title: string; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // openToken per task (returned by /tasks/open)
  const [openTokens, setOpenTokens] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!token) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function load() {
    if (!token) return;
    const res = await apiFetch<{ tasks: Task[] }>("/tasks", { token });
    setTasks(res.tasks);
  }

  async function openTask(t: Task) {
    if (!token) return;
    try {
      setBusyId(t.id);

      const r = await apiFetch<{ ok: true; openToken: string; openTokenExpiresAt: string }>("/tasks/open", {
        token,
        body: { taskId: t.id },
      });

      setOpenTokens((prev) => ({ ...prev, [t.id]: r.openToken }));
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, opened: true } : x)));

      setBusyId(null);

      const url = t.url || `https://t.me/${t.chatId.replace("@", "")}`;
      const tg = (window as any)?.Telegram?.WebApp;
      if (tg?.openTelegramLink && url.startsWith("https://t.me/")) tg.openTelegramLink(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setBusyId(null);
      setOverlay({ title: "Ошибка", text: e?.code ?? "Не удалось открыть." });
    }
  }

  async function claim(taskId: string) {
    if (!token) return;

    const openToken = openTokens[taskId];
    if (!openToken) {
      setOverlay({ title: "Сначала «Перейти»", text: "Открой задание через «Перейти», затем нажми «Получить»." });
      return;
    }

    try {
      setBusyId(taskId);

      await apiFetch("/tasks/claim", { token, body: { taskId, openToken } });

      await refresh();
      await load();

      // token одноразовый — после успешного claim удаляем локально
      setOpenTokens((prev) => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });

      setBusyId(null);
    } catch (e: any) {
      setBusyId(null);

      if (e?.code === "not_subscribed") setOverlay({ title: "Не подписан", text: "Подпишись и нажми «Получить»." });
      else if (e?.code === "need_open_first") setOverlay({ title: "Сначала «Перейти»", text: "Открой канал, потом получи награду." });
      else if (e?.code === "already_claimed") setOverlay({ title: "Уже получено", text: "Награда уже получена." });
      else if (e?.code === "task_limit_reached") setOverlay({ title: "Лимит", text: "Лимит по этому заданию исчерпан." });
      else if (e?.code === "bot_suspected") setOverlay({ title: "Слишком быстро", text: "Попробуй позже." });
      else setOverlay({ title: "Ошибка", text: e?.code ?? "Не удалось получить награду." });
    }
  }

  return (
    <div className="safe col">
      <h1 className="h1">Задания</h1>

      {tasks.length === 0 ? (
        <div className="card" style={{ padding: 14, fontWeight: 800 }}>
          Пока нет заданий
        </div>
      ) : null}

      {tasks.map((t) => {
        const busy = busyId === t.id;

        return (
          <div key={t.id} className="card" style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 16, letterSpacing: "-0.1px" }}>{t.title}</div>
                <div className="muted" style={{ marginTop: 6, fontWeight: 700 }}>{t.description}</div>
              </div>
              <span className="pill">
                {t.rewardType === "COINS" ? `🪙 ${fmtCoins(t.rewardValue)}` : `💎 ${t.rewardValue}`}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 10 }}>
              <span className="pill">{t.completedCount}/{t.cap}</span>

              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btnSoft" disabled={busy} onClick={() => openTask(t)}>
                  Перейти
                </button>

                {t.claimed ? (
                  <button className="btn btnGreen" disabled>
                    Получено
                  </button>
                ) : (
                  <button className="btn btnGreen" disabled={!t.opened || busy} onClick={() => claim(t.id)}>
                    Получить
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {overlay ? <Overlay title={overlay.title} text={overlay.text} onClose={() => setOverlay(null)} /> : null}
    </div>
  );
}
