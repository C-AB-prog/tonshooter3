import { ENERGY_MAX, ENERGY_REGEN_MINUTES } from "./economy.js";

export function applyEnergyRegen(currentEnergy: number, energyUpdatedAt: Date, now: Date): { energy: number; updatedAt: Date } {
  if (currentEnergy >= ENERGY_MAX) return { energy: ENERGY_MAX, updatedAt: energyUpdatedAt };

  const diffMs = now.getTime() - energyUpdatedAt.getTime();
  if (diffMs <= 0) return { energy: currentEnergy, updatedAt: energyUpdatedAt };

  const regenSteps = Math.floor(diffMs / (ENERGY_REGEN_MINUTES * 60 * 1000));
  if (regenSteps <= 0) return { energy: currentEnergy, updatedAt: energyUpdatedAt };

  const newEnergy = Math.min(ENERGY_MAX, currentEnergy + regenSteps);
  const newUpdatedAt = new Date(energyUpdatedAt.getTime() + regenSteps * ENERGY_REGEN_MINUTES * 60 * 1000);

  return { energy: newEnergy, updatedAt: newUpdatedAt };
}
