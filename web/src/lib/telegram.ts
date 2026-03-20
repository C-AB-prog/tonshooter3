declare global {
  interface Window {
    Telegram?: any;
  }
}

export function getWebApp() {
  return window.Telegram?.WebApp;
}

export function isInTelegram(): boolean {
  return Boolean(getWebApp()?.initData);
}

export function getInitData(): string {
  const wa = getWebApp();
  return wa?.initData ?? "";
}

export function readyTelegram() {
  const wa = getWebApp();
  try {
    wa?.ready?.();
    wa?.expand?.();
  } catch {
    // ignore
  }
}
