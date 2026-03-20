import { TonConnectUI } from "@tonconnect/ui";
import { apiFetch } from "./api";

export type TonPurchaseKind = "boost" | "upgrade_weapon_5" | "upgrade_range_5";
export type TonPayMode = "mock" | "tonconnect";

export function getTonPayMode(): TonPayMode {
  const v = (import.meta.env.VITE_TON_PAY_MODE as string | undefined) ?? "mock";
  return v === "tonconnect" ? "tonconnect" : "mock";
}

let _ui: TonConnectUI | null = null;

export function getTonConnectUI(): TonConnectUI {
  if (_ui) return _ui;
  const manifestUrl = (import.meta.env.VITE_TONCONNECT_MANIFEST_URL as string | undefined) ?? "";
  _ui = new TonConnectUI({ manifestUrl: manifestUrl || undefined });
  return _ui;
}

export function getConnectedAddress(): string | null {
  const ui = getTonConnectUI();
  const addr = ui.account?.address;
  return addr ?? null;
}

/**
 * Create a payment intent on backend.
 * NOTE: keep payload a string (no Buffer) to avoid Telegram Desktop / browser polyfill issues.
 */
export async function tonConnectPay(purchase: TonPurchaseKind, apiToken: string): Promise<any> {
  const mode = getTonPayMode();
  if (mode === "mock") {
    return apiFetch("/ton/purchase/mock", { token: apiToken, body: { purchase } });
  }

  const ui = getTonConnectUI();
  await ui.connectWallet();

  const intent = await apiFetch<{
    receiver: string;
    amountNano: string;
    validUntil: number;
    payload: string;
  }>("/ton/purchase/intent", { token: apiToken, body: { purchase } });

  await ui.sendTransaction({
    validUntil: intent.validUntil,
    messages: [
      {
        address: intent.receiver,
        amount: intent.amountNano,
        payload: intent.payload,
      },
    ],
  });

  return apiFetch("/ton/purchase/confirm", { token: apiToken, body: { purchase } });
}
