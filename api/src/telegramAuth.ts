import crypto from "node:crypto";

/**
 * Verifies Telegram WebApp initData.
 * Algorithm: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyTelegramInitData(initData: string, botToken: string): { ok: boolean; data?: Record<string, string> } {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false };

  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key === "hash") return;
    pairs.push(`${key}=${value}`);
  });

  pairs.sort(); // sort by key
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (!timingSafeEqualHex(computedHash, hash)) return { ok: false };

  const out: Record<string, string> = {};
  params.forEach((value, key) => (out[key] = value));
  return { ok: true, data: out };
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export function parseTelegramUser(initData: string): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const userJson = params.get("user");
  if (!userJson) return null;
  try {
    const u = JSON.parse(userJson);
    return u;
  } catch {
    return null;
  }
}

export function parseStartParam(initData: string): string | null {
  const params = new URLSearchParams(initData);
  return params.get("start_param");
}
