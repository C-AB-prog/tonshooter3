import { create } from "zustand";
import { apiFetch, ApiUser } from "../lib/api";

const LS_KEY = "tonshooter_token";

type State = {
  token: string | null;
  user: ApiUser | null;
  error: string | null;
  inFlight: boolean;

  login: () => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => void;
};

function getInitData(): string {
  const w: any = window as any;
  const tg = w?.Telegram?.WebApp;
  const initData = tg?.initData;
  // dev-режим: можно руками поставить localStorage tonshooter_dev_init=dev
  const dev = localStorage.getItem("tonshooter_dev_init");
  return initData && initData.length ? initData : dev === "dev" ? "dev" : "";
}

export const useSession = create<State>((set, get) => ({
  token: localStorage.getItem(LS_KEY),
  user: null,
  error: null,
  inFlight: false,

  logout: () => {
    localStorage.removeItem(LS_KEY);
    set({ token: null, user: null, error: null, inFlight: false });
  },

  login: async () => {
    set({ inFlight: true, error: null });
    try {
      const initData = getInitData();
      if (!initData) {
        set({ inFlight: false, error: "no_init_data" });
        return;
      }

      const r = await apiFetch<{ token: string }>("/auth/telegram", {
        body: { initData },
      });

      localStorage.setItem(LS_KEY, r.token);
      set({ token: r.token, inFlight: false, error: null });

      await get().refresh();
    } catch (e: any) {
      set({ inFlight: false, error: e?.code ?? "login_failed" });
      get().logout();
    }
  },

  refresh: async () => {
    const token = get().token;
    if (!token) return;

    set({ inFlight: true, error: null });

    try {
      const r = await apiFetch<{ user: ApiUser }>("/me", { token });
      set({ user: r.user, inFlight: false, error: null });
    } catch (e: any) {
      // ключевой фикс: НЕ ВИСИМ, если /me упал
      console.error("[session.refresh] failed:", e);
      set({ inFlight: false, error: e?.code ?? "profile_load_failed" });
      get().logout();
    }
  },
}));
