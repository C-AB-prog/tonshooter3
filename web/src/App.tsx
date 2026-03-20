import React, { useEffect, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { useSession } from "./store/useSession";
import { TopCard } from "./components/TopCard";
import { EnergyBar } from "./components/EnergyBar";
import { BottomNav } from "./components/BottomNav";
import Home from "./screens/Home";
import Shoot from "./screens/Shoot";
import Upgrades from "./screens/Upgrades";
import Tasks from "./screens/Tasks";
import Profile from "./screens/Profile";
import Wallet from "./screens/Wallet";
import Admin from "./screens/Admin";
import "./styles/components.css";

export default function App() {
  const { token, user, login, refresh, error } = useSession();
  const [booting, setBooting] = useState(true);
  const loc = useLocation();

  useEffect(() => {
    void (async () => {
      try {
        if (!token) await login();
        else await refresh();
      } finally {
        setBooting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (booting) {
    return (
      <div className="safe">
        <div className="card" style={{ padding: 14, fontWeight: 800 }}>Загрузка…</div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="safe col">
        <div className="card" style={{ padding: 14 }}>
          <div className="h2">Вход</div>
          <button className="btn btnPrimary" style={{ width: "100%", marginTop: 12 }} onClick={() => login()}>
            Повторить
          </button>
          {error ? <div className="muted" style={{ marginTop: 10, fontWeight: 700, fontSize: 12 }}>{String(error)}</div> : null}
        </div>
      </div>
    );
  }

  const isHome = loc.pathname === "/";

  return (
    <div>
      {isHome ? (
        <div className="safe col" style={{ paddingBottom: 12 }}>
          <div className="h1">Главная</div>

          {user ? (
            <>
              <TopCard user={user} />
              <EnergyBar user={user} />
            </>
          ) : (
            <div className="card" style={{ padding: 14, fontWeight: 800 }}>…</div>
          )}
        </div>
      ) : null}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/shoot" element={<Shoot />} />
        <Route path="/upgrades" element={<Upgrades />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/wallet" element={<Wallet />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>

      <BottomNav />
    </div>
  );
}
