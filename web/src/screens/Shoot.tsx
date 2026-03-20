import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "../store/useSession";
import { apiFetch } from "../lib/api";
import { getTonPayMode, tonConnectPay } from "../lib/tonconnect";
import { Overlay } from "../components/Overlay";

type ShotStart = {
  sessionId: string;
  serverStartedAt: string;
  difficulty: number;
  zoneCenter: number;
  zoneWidth: number;
  speed: number;
  energyCost: number;
  zoneMoves?: boolean;
  zonePhase?: number;
};

type FireRes = {
  hit: boolean;
  pos: number;
  coinsAward: string;
  energy: number;
  difficulty: number;
  balances: { coins: string; crystals: string; tonBalance: string };
};

function pingPong01(x: number): number {
  const mod = x % 2;
  return mod <= 1 ? mod : 2 - mod;
}

function zoneCenterAtMs(elapsedMs: number, zoneWidth: number, speed: number, phase: number): number {
  const min = zoneWidth / 2;
  const max = 1 - zoneWidth / 2;
  const span = Math.max(0, max - min);
  const t = elapsedMs / 1000;
  const p = pingPong01(t * speed + phase);
  return min + p * span;
}

function fmtBigintString(n: string) {
  try {
    return BigInt(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  } catch {
    return n;
  }
}

export default function Shoot() {
  const { user, token, refresh } = useSession();
  const [overlay, setOverlay] = useState<{ title: string; text: string } | null>(null);

  const [session, setSession] = useState<ShotStart | null>(null);
  const [pos, setPos] = useState(0);
  const [zoneCenter, setZoneCenter] = useState(0.5);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ hit: boolean; coins: string } | null>(null);
  const [misses, setMisses] = useState(0);

  const startedPerf = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const running = useRef(false);

  const zone = useMemo(() => {
    if (!session) return { left: 0.46, width: 0.18 };
    return {
      left: zoneCenter - session.zoneWidth / 2,
      width: session.zoneWidth,
    };
  }, [session, zoneCenter]);

  useEffect(() => {
    if (!token) return;
    void startAttempt();
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!session) return;

    if (raf.current) cancelAnimationFrame(raf.current);
    startedPerf.current = performance.now();
    running.current = true;

    const tick = () => {
      if (!running.current || !session) return;

      const t = (performance.now() - (startedPerf.current ?? performance.now())) / 1000;
      const p = pingPong01(t * session.speed);
      setPos(p);

      if (session.zoneMoves) {
        const elapsedMs = performance.now() - (startedPerf.current ?? performance.now());
        const phase = session.zonePhase ?? 0;
        const c = zoneCenterAtMs(elapsedMs, session.zoneWidth, session.speed, phase);
        setZoneCenter(c);
      } else {
        setZoneCenter(session.zoneCenter);
      }

      raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
  }, [session]);

  if (!user || !token) return null;
  const tok = token;

  const pct = Math.max(0, Math.min(100, (user.energy / user.energyMax) * 100));

  async function startAttempt() {
    setBusy(true);
    setResult(null);
    setMisses(0);

    try {
      const s = await apiFetch<ShotStart>("/shot/start", { token, body: {} });
      setSession(s);
      setZoneCenter(s.zoneCenter);
      setBusy(false);
    } catch (e: any) {
      setBusy(false);
      setSession(null);

      if (e?.code === "no_energy") setOverlay({ title: "Нет энергии", text: "Можно купить буст энергии." });
      else if (e?.code === "bot_suspected") setOverlay({ title: "Слишком быстро", text: "Попробуй позже." });
      else setOverlay({ title: "Ошибка", text: "Не удалось начать игру." });
    }
  }

  async function buyBoost() {
    try {
      setBusy(true);
      if (getTonPayMode() === "mock") {
        await apiFetch("/ton/purchase/mock", { token, body: { purchase: "boost" } });
      } else {
        await tonConnectPay("boost", tok);
      }
      await refresh();
      setBusy(false);
      setOverlay({ title: "Успешно! 🔋", text: "Энергия полностью восстановлена!" });
    } catch (e: any) {
      setBusy(false);
      const code = e?.code;
      if (code === "boost_cooldown") setOverlay({ title: "Кулдаун", text: "Буст доступен раз в 6 часов." });
      else if (code === "mock_disabled") setOverlay({ title: "Отключено", text: "Mock режим выключен." });
      else setOverlay({ title: "Ошибка", text: code ?? "Не удалось купить буст" });
    }
  }

  async function fire() {
    if (!session || busy) return;

    running.current = false;
    if (raf.current) cancelAnimationFrame(raf.current);

    setBusy(true);

    try {
      const elapsed = Math.floor(performance.now() - (startedPerf.current ?? performance.now()));
      const r = await apiFetch<FireRes>("/shot/fire", {
        token,
        body: { sessionId: session.sessionId, clientElapsedMs: elapsed },
      });

      setResult({ hit: r.hit, coins: r.coinsAward });
      if (!r.hit) setMisses((m) => m + 1);

      await refresh();

      if (!r.hit) setOverlay({ title: "Промах! 💥", text: "Сложность сброшена. Попробуй снова!" });

      setBusy(false);
    } catch (e: any) {
      setBusy(false);
      if (e?.code === "no_energy") setOverlay({ title: "Нет энергии", text: "Купить буст?" });
      else if (e?.code === "bot_suspected") setOverlay({ title: "Слишком быстро", text: "Замедлись немного." });
      else setOverlay({ title: "Ошибка", text: "Попробуй ещё раз." });
    }
  }

  async function adminFillEnergy() {
    try {
      setBusy(true);
      await apiFetch("/admin/energy/fill", { token, body: {} });
      await refresh();
      setBusy(false);
    } catch (e: any) {
      setBusy(false);
      setOverlay({ title: "Ошибка", text: e?.code ?? "admin_fill_failed" });
    }
  }

  return (
    <div className="safe col">
      <div className="card" style={{ padding: 18 }}>
        <div
          className="h2"
          style={{
            background: "linear-gradient(135deg, var(--text-bright), var(--green2))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            fontSize: 24,
            marginBottom: 8,
          }}
        >
          🎯 Стрельба
        </div>

        <div className="muted" style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.4 }}>
          Попади в зелёную зону — получишь Coins! Чем точнее, тем больше награда.
        </div>

        <div className="balanceRow" style={{ marginTop: 16 }}>
          <div className="balanceItem">
            <span style={{ opacity: 0.7 }}>Цена:</span> {session ? session.energyCost : "—"} ⚡
          </div>
          <div className="balanceItem">
            <span style={{ opacity: 0.7 }}>Промахи:</span> {misses}
          </div>
          <div className="balanceItem">
            ⚡ {user.energy}/{user.energyMax}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="energyBar">
            <div className="energyFill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Игровой трек */}
      <div className="card" style={{ padding: 18 }}>
        <div className="shootTrack">
          <div
            className="shootZone"
            style={{
              left: `${Math.max(0, zone.left) * 100}%`,
              width: `${Math.max(0, zone.width) * 100}%`,
            }}
          />
          <div
            className="shootBullet"
            style={{
              left: `${pos * 100}%`,
            }}
          />
        </div>

        {result ? (
          <div
            className={result.hit ? "notice successNotice" : "notice errorNotice"}
            style={{ marginTop: 16, textAlign: "center", fontSize: 16 }}
          >
            {result.hit ? `🎉 +${fmtBigintString(result.coins)} Coins!` : "💥 Промах!"}
          </div>
        ) : null}
      </div>

      {/* Кнопки управления */}
      <div className="fixedActionWrap">
        <div className="fixedActionInner">
          <button
            className="btn btnPrimary bigAction"
            disabled={busy || !session}
            onClick={fire}
            style={{
              background: "linear-gradient(135deg, var(--danger), #ff6b85)",
              boxShadow: "0 12px 32px rgba(255, 77, 106, 0.4), 0 0 40px rgba(255, 77, 106, 0.3)",
            }}
          >
            {busy ? <span className="loading"></span> : "🔥 ОГОНЬ!"}
          </button>

          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            <button className="btn btnSoft" disabled={busy} onClick={startAttempt}>
              🔄 Новая попытка
            </button>

            <button className="btn btnGreen" disabled={busy} onClick={buyBoost}>
              ⚡ Буст энергии • 🔷 1 TON
            </button>

            {user.isAdmin ? (
              <button className="btn btnPurple" disabled={busy} onClick={adminFillEnergy}>
                👑 (ADMIN) Энергия 100
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {overlay ? (
        <Overlay
          title={overlay.title}
          text={overlay.text}
          onClose={() => setOverlay(null)}
          action={
            overlay.title === "Нет энергии"
              ? {
                  label: "⚡ Купить буст",
                  onClick: () => {
                    setOverlay(null);
                    void buyBoost();
                  },
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
