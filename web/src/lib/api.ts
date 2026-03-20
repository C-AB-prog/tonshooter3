export type ApiUser = {
  tgUserId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;

  coins: string;
  crystals: string;
  tonBalance: string;

  weaponLevel: number;
  rangeLevel: number;

  energy: number;
  energyMax: number;

  difficulty: number;

  boostActiveUntil: string | null;
  boostCooldownUntil: string | null;
  boostActive: boolean;

  isBotBlocked: boolean;
  suspicionScore: number;

  // Referral progress / withdraw gating
  shotsCount: number;
  hitsCount: number;
  referralQualifiedAt: string | null;
  referralRewardedAt: string | null;
  activeReferralCount: number;
  canWithdrawTon: boolean;

  // добавили
  isAdmin: boolean;
};

type ApiError = {
  code: string;
  status?: number;
  message?: string;
  payload?: any;
};

const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

function joinUrl(base: string, path: string) {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

export async function apiFetch<T>(
  path: string,
  opts?: {
    token?: string | null;
    body?: any;
    method?: string;
    timeoutMs?: number;
  }
): Promise<T> {
  const url = joinUrl(API_URL, path);
  const method = opts?.method ?? (opts?.body ? "POST" : "GET");
  const timeoutMs = opts?.timeoutMs ?? 12_000;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(opts?.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    const text = await resp.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!resp.ok) {
      const err: ApiError = {
        code: json?.error ?? `http_${resp.status}`,
        status: resp.status,
        message: json?.message ?? text ?? "Request failed",
        payload: json,
      };
      throw err;
    }

    return (json ?? {}) as T;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw { code: "timeout", message: "Request timeout" } satisfies ApiError;
    }
    // если это уже ApiError — прокидываем
    if (e?.code) throw e;
    throw { code: "network_error", message: String(e) } satisfies ApiError;
  } finally {
    clearTimeout(t);
  }
}
