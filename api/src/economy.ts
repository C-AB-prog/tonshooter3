/**
 * Формулы из ТЗ.
 * EnergyCost = 1 + WeaponLevel + RangeLevel
 * Coins(на попадание) = 300 + 250*WeaponLevel + 200*RangeLevel
 *
 * Энергия: max=100, regen 1 каждые 5 минут.
 * Курс: 100_000 coins = 1 crystal; 100 crystals = 1 ton
 */
export const ENERGY_MAX = 100;
export const ENERGY_REGEN_MINUTES = 5;

export function energyCost(weaponLevel: number, rangeLevel: number): number {
  return 1 + weaponLevel + rangeLevel;
}

export function energyCostWithBoost(baseCost: number, boost: boolean): number {
  // NOTE (project rule change): boost no longer reduces shot cost.
  // Boost is now an "energy refill" (sets energy to 100) and has only cooldown.
  // We keep this function to avoid touching call-sites; it always returns baseCost.
  void boost;
  return baseCost;
}

export function coinsForHit(weaponLevel: number, rangeLevel: number): number {
  return 300 + 250 * weaponLevel + 200 * rangeLevel;
}

export const COINS_PER_CRYSTAL = 100_000;
export const CRYSTALS_PER_TON = 100;

// --- Custom economy tweaks (project decisions) ---
// Upgrade to level 5 for Weapon / Range costs TON instead of Coins.
export const UPGRADE_TO_LEVEL5_TON_COST = 2;

// Boost (energy refill) can be bought only for TON.
export const BOOST_TON_COST = 1;

// Boost cooldown (v2.1): 6 hours
export const BOOST_COOLDOWN_MS = 6 * 60 * 60 * 1000;

// Backward-compatible alias (some routes used this name)
export const LEVEL5_TON_COST = UPGRADE_TO_LEVEL5_TON_COST;

// Referral rules (from TЗ)
export const REFERRAL_REWARD_COINS = 250_000;
export const REFERRAL_ACTIVE_SHOTS = 50;
export const REFERRAL_ACTIVE_HITS = 20;
export const REFERRAL_ACTIVE_WINDOW_HOURS = 24;

export function coinsToCrystals(coins: bigint): bigint {
  return coins / BigInt(COINS_PER_CRYSTAL);
}
export function crystalsToTon(crystals: bigint): number {
  return Number(crystals) / CRYSTALS_PER_TON;
}

// Пример цен улучшений (из ТЗ)
export const UPGRADE_PRICES: Record<number, number> = {
  1: 50_000,      // 1 -> 2
  2: 120_000,     // 2 -> 3
  3: 300_000,     // 3 -> 4
  4: 800_000,     // 4 -> 5
  5: 2_000_000,   // 5 -> 6
  6: 5_000_000,   // 6 -> 7
  7: 12_000_000,  // 7 -> 8
  8: 25_000_000,  // 8 -> 9
  9: 50_000_000,  // 9 -> 10
};

export const MAX_LEVEL = 10;

export function upgradePrice(currentLevel: number): number | null {
  if (currentLevel >= MAX_LEVEL) return null;
  return UPGRADE_PRICES[currentLevel] ?? null;
}

export function canUpgrade(weaponLevel: number, rangeLevel: number, which: "weapon" | "range"): { ok: boolean; reason?: string } {
  const w = weaponLevel;
  const r = rangeLevel;
  const nextW = which === "weapon" ? w + 1 : w;
  const nextR = which === "range" ? r + 1 : r;

  if (nextW > MAX_LEVEL || nextR > MAX_LEVEL) return { ok: false, reason: "Достигнут максимальный уровень" };

  // ТЗ: |WeaponLevel - RangeLevel| ≤ 3
  if (Math.abs(nextW - nextR) > 3) return { ok: false, reason: "Разница уровней не должна превышать 3" };

  const price = upgradePrice(which === "weapon" ? w : r);
  if (price == null) return { ok: false, reason: "Улучшение недоступно" };

  return { ok: true };
}
