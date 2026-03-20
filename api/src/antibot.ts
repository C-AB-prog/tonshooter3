import { prisma } from "./prisma.js";
import { config } from "./config.js";

export type ActionType =
  | "auth"
  | "shot_start"
  | "shot_fire"
  | "upgrade"
  | "exchange"
  | "boost"
  | "task_open"
  | "task_claim"
  | "withdraw"
  | "admin_energy_fill"
  | "admin_grant"
  | "ton_purchase_paid"
  | "ton_payment_mock"
  | "referral_reward";


export async function logAction(userId: string, type: ActionType, meta?: any) {
  await prisma.actionLog.create({
    data: { userId, type, meta },
  });
}

/**
 * Very simple antibot:
 * - tracks last action time (via ActionLog)
 * - if actions too fast -> increases suspicionScore slowly
 * - if suspicionScore >= threshold -> isBotBlocked = true
 */
export async function antibotCheckAndMaybeFlag(userId: string, action: ActionType, now: Date) {
  // If already blocked, reject
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { isBotBlocked: true, suspicionScore: true } });
  if (!u) return { blocked: false, suspicion: 0 };
  if (u.isBotBlocked) return { blocked: true, suspicion: u.suspicionScore };

  const last = await prisma.actionLog.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const deltaMs = last ? now.getTime() - last.createdAt.getTime() : 999999;
  const minMs = config.antibotMinActionMs;

  // мягче чем раньше: +1 вместо +2
  const inc = deltaMs < minMs ? 1 : 0;

  if (inc > 0) {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { suspicionScore: { increment: inc } },
      select: { suspicionScore: true, isBotBlocked: true },
    });

    const shouldBlock = updated.suspicionScore >= config.antibotSuspicionThreshold;
    if (shouldBlock) {
      await prisma.user.update({ where: { id: userId }, data: { isBotBlocked: true } });
      return { blocked: true, suspicion: updated.suspicionScore };
    }

    return { blocked: false, suspicion: updated.suspicionScore };
  }

  // log action timing is OK
  return { blocked: false, suspicion: u.suspicionScore };
}
