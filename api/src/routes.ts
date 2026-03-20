import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "./prisma.js";
import { config } from "./config.js";
import { verifyTelegramInitData, parseTelegramUser, parseStartParam } from "./telegramAuth.js";
import { signJwt } from "./jwt.js";
import { requireAuth, AuthedRequest } from "./authMiddleware.js";
import { applyEnergyRegen } from "./energy.js";
import {
  coinsForHit,
  energyCost,
  energyCostWithBoost,
  canUpgrade,
  upgradePrice,
  COINS_PER_CRYSTAL,
  CRYSTALS_PER_TON,
  ENERGY_MAX,
  BOOST_TON_COST,
  BOOST_COOLDOWN_MS,
  UPGRADE_TO_LEVEL5_TON_COST,
  LEVEL5_TON_COST,
  REFERRAL_REWARD_COINS,
  REFERRAL_ACTIVE_SHOTS,
  REFERRAL_ACTIVE_HITS,
  REFERRAL_ACTIVE_WINDOW_HOURS,
} from "./economy.js";
import { antibotCheckAndMaybeFlag, logAction } from "./antibot.js";
import { difficultyToParams, positionAt, isHit, zoneCenterAt } from "./shooting.js";
import { RewardType, Prisma } from "@prisma/client";

export const router = Router();

/** simple health for proxy checks */
router.get("/health", (_req, res) => res.json({ ok: true }));

function isAdminTg(tgUserId: bigint): boolean {
  return config.adminIds.includes(tgUserId.toString());
}

/**
 * Auth — initData verification and user bootstrap
 */
router.post("/auth/telegram", async (req, res) => {
  const schema = z.object({ initData: z.string().min(1) });
  const { initData } = schema.parse(req.body);

  // Dev helper: allow login without Telegram when DEV_BYPASS_TG=1
  if (config.devBypassTg && initData === "dev") {
    const tgUserId = BigInt(999000);
    const user = await prisma.user.upsert({
      where: { tgUserId },
      create: { tgUserId, username: "dev_user", firstName: "Dev", lastName: "User" },
      update: {},
    });
    await logAction(user.id, "auth", { dev: true });
    const token = signJwt({ uid: user.id, tg: tgUserId.toString() });
    return res.json({ token });
  }

  const verified = verifyTelegramInitData(initData, config.botToken);
  if (!verified.ok) return res.status(401).json({ error: "invalid_init_data" });

  const tgUser = parseTelegramUser(initData);
  if (!tgUser?.id) return res.status(401).json({ error: "no_user" });

  const startParam = parseStartParam(initData);
  const tgId = BigInt(tgUser.id);

  // upsert user
  const user = await prisma.user.upsert({
    where: { tgUserId: tgId },
    create: {
      tgUserId: tgId,
      username: tgUser.username,
      firstName: tgUser.first_name,
      lastName: tgUser.last_name,
    },
    update: {
      username: tgUser.username,
      firstName: tgUser.first_name,
      lastName: tgUser.last_name,
    },
  });

  // bind referral once
  if (startParam && !user.referrerId) {
    const m = /^ref_(.+)$/.exec(startParam);
    if (m?.[1]) {
      const refTg = BigInt(m[1]);
      const ref = await prisma.user.findUnique({ where: { tgUserId: refTg } });
      if (ref && ref.id !== user.id) {
        await prisma.user.update({ where: { id: user.id }, data: { referrerId: ref.id } });
      }
    }
  }

  await logAction(user.id, "auth", { tg: tgUser.id });

  const token = signJwt({ uid: user.id, tg: tgUser.id.toString() });
  return res.json({ token });
});

/**
 * Get current state
 */
router.get("/me", requireAuth, async (req, res) => {
  const { uid, tgUserId } = (req as AuthedRequest).auth;
  const now = new Date();

  const user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user) return res.status(404).json({ error: "not_found" });

  const regen = applyEnergyRegen(user.energy, user.energyUpdatedAt, now);
  if (regen.energy !== user.energy || regen.updatedAt.getTime() !== user.energyUpdatedAt.getTime()) {
    await prisma.user.update({
      where: { id: uid },
      data: { energy: regen.energy, energyUpdatedAt: regen.updatedAt },
    });
  }

  const boostActive = user.boostActiveUntil ? user.boostActiveUntil.getTime() > now.getTime() : false;

  // Referral-derived eligibility (TЗ: withdraw unlocked by 1 active referral)
  const activeReferralCount = await prisma.user.count({
    where: { referrerId: uid, referralRewardedAt: { not: null } },
  });
  const canWithdrawTon = activeReferralCount >= 1;

  return res.json({
    user: {
      tgUserId: user.tgUserId.toString(),
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      coins: user.coins.toString(),
      crystals: user.crystals.toString(),
      tonBalance: user.tonBalance.toString(),
      weaponLevel: user.weaponLevel,
      rangeLevel: user.rangeLevel,
      energy: regen.energy,
      energyMax: ENERGY_MAX,
      difficulty: user.difficulty,
      boostActiveUntil: user.boostActiveUntil?.toISOString() ?? null,
      boostCooldownUntil: user.boostCooldownUntil?.toISOString() ?? null,
      boostActive,
      isBotBlocked: user.isBotBlocked,
      suspicionScore: user.suspicionScore,

      shotsCount: user.shotsCount,
      hitsCount: user.hitsCount,
      referralQualifiedAt: user.referralQualifiedAt?.toISOString() ?? null,
      referralRewardedAt: user.referralRewardedAt?.toISOString() ?? null,
      activeReferralCount,
      canWithdrawTon,
      isAdmin: isAdminTg(tgUserId),
    },
  });
});

/**
 * ADMIN: refill energy to max
 */
router.post("/admin/energy/fill", requireAuth, async (req, res) => {
  const { uid, tgUserId } = (req as AuthedRequest).auth;
  if (!isAdminTg(tgUserId)) return res.status(403).json({ error: "forbidden" });

  const now = new Date();
  const updated = await prisma.user.update({
    where: { id: uid },
    data: { energy: ENERGY_MAX, energyUpdatedAt: now },
  });

  await logAction(uid, "admin_energy_fill", { by: tgUserId.toString() });
  return res.json({ ok: true, energy: updated.energy, energyMax: ENERGY_MAX });
});

/**
 * ADMIN: grant resources / set levels / resets (dev helper)
 * Allows: coins, crystals, tonBalance, energy, weaponLevel, rangeLevel
 * Optional targetTgUserId to apply to another user.
 */
router.post("/admin/grant", requireAuth, async (req, res) => {
  const { uid, tgUserId } = (req as AuthedRequest).auth;
  if (!isAdminTg(tgUserId)) return res.status(403).json({ error: "forbidden" });

  const schema = z.object({
    targetTgUserId: z.string().optional(),
    coins: z.union([z.string(), z.number()]).optional(),
    crystals: z.union([z.string(), z.number()]).optional(),
    tonBalance: z.union([z.string(), z.number()]).optional(),
    energy: z.number().int().min(0).max(ENERGY_MAX).optional(),
    weaponLevel: z.number().int().min(1).max(10).optional(),
    rangeLevel: z.number().int().min(1).max(10).optional(),
    resetBoost: z.boolean().optional(),
    resetWithdrawal: z.boolean().optional(),
    resetAntibot: z.boolean().optional(),
  });
  const body = schema.parse(req.body ?? {});

  const target = body.targetTgUserId
    ? await prisma.user.findUnique({ where: { tgUserId: BigInt(body.targetTgUserId) } })
    : await prisma.user.findUnique({ where: { id: uid } });

  if (!target) return res.status(404).json({ error: "target_not_found" });

  const data: Prisma.UserUpdateInput = {};
  if (body.coins !== undefined) (data as any).coins = { increment: BigInt(body.coins) };
  if (body.crystals !== undefined) (data as any).crystals = { increment: BigInt(body.crystals) };
  if (body.tonBalance !== undefined) (data as any).tonBalance = { increment: new Prisma.Decimal(body.tonBalance) };
  if (body.energy !== undefined) {
    (data as any).energy = body.energy;
    (data as any).energyUpdatedAt = new Date();
  }
  if (body.weaponLevel !== undefined) (data as any).weaponLevel = body.weaponLevel;
  if (body.rangeLevel !== undefined) (data as any).rangeLevel = body.rangeLevel;
  if (body.resetBoost) {
    (data as any).boostActiveUntil = null;
    (data as any).boostCooldownUntil = null;
  }
  if (body.resetWithdrawal) {
    (data as any).lastWithdrawalAt = null;
  }
  if (body.resetAntibot) {
    (data as any).isBotBlocked = false;
    (data as any).suspicionScore = 0;
  }

  const updated = await prisma.user.update({ where: { id: target.id }, data });
  await logAction(target.id, "admin_grant", {
    by: tgUserId.toString(),
    targetTgUserId: updated.tgUserId.toString(),
    patch: body,
  });

  return res.json({
    ok: true,
    user: {
      id: updated.id,
      tgUserId: updated.tgUserId.toString(),
      coins: updated.coins.toString(),
      crystals: updated.crystals.toString(),
      tonBalance: updated.tonBalance.toString(),
      energy: updated.energy,
      weaponLevel: updated.weaponLevel,
      rangeLevel: updated.rangeLevel,
    },
  });
});

/**
 * ADMIN: manage tasks (ads)
 * Create tasks with a cap (how many unique users can claim reward)
 * and optional subscription check.
 */
router.get("/admin/tasks", requireAuth, async (req, res) => {
  const { tgUserId } = (req as AuthedRequest).auth;
  if (!isAdminTg(tgUserId)) return res.status(403).json({ error: "forbidden" });

  const tasks = await prisma.task.findMany({ orderBy: { createdAt: "desc" } });
  return res.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      chatId: t.chatId,
      url: t.url,
      cap: t.cap,
      completedCount: t.completedCount,
      requireSubscriptionCheck: t.requireSubscriptionCheck,
      rewardType: t.rewardType,
      rewardValue: t.rewardValue,
      isActive: t.isActive,
      createdAt: t.createdAt.toISOString(),
    })),
  });
});

router.post("/admin/tasks/create", requireAuth, async (req, res) => {
  const { tgUserId } = (req as AuthedRequest).auth;
  if (!isAdminTg(tgUserId)) return res.status(403).json({ error: "forbidden" });

  const schema = z.object({
    title: z.string().min(1).max(64),
    description: z.string().min(1).max(256),
    chatId: z.string().min(1).max(128),
    url: z.string().min(5).max(512),
    rewardType: z.enum(["COINS", "CRYSTALS"]),
    rewardValue: z.number().int().positive(),
    cap: z.number().int().min(1).max(1_000_000),
    requireSubscriptionCheck: z.boolean().optional(),
  });
  const body = schema.parse(req.body);

  const created = await prisma.task.create({
    data: {
      title: body.title,
      description: body.description,
      chatId: body.chatId,
      url: body.url,
      cap: body.cap,
      requireSubscriptionCheck: body.requireSubscriptionCheck ?? false,
      rewardType: body.rewardType as any,
      rewardValue: body.rewardValue,
      isActive: true,
    },
  });

  return res.json({ ok: true, task: { id: created.id } });
});

router.post("/admin/tasks/deactivate", requireAuth, async (req, res) => {
  const { tgUserId } = (req as AuthedRequest).auth;
  if (!isAdminTg(tgUserId)) return res.status(403).json({ error: "forbidden" });

  const schema = z.object({ taskId: z.string().min(1), isActive: z.boolean() });
  const { taskId, isActive } = schema.parse(req.body);

  await prisma.task.update({ where: { id: taskId }, data: { isActive } });
  return res.json({ ok: true });
});

 /**
 * TON purchases (real, via TonConnect)
 *
 * Flow:
 * 1) POST /ton/wallet/set { address }  (optional but recommended)
 * 2) POST /ton/purchase/intent { purchase } -> { purchaseId, receiver, amountNano, comment, validUntil }
 * 3) Client sends TON transfer to `receiver` with `amountNano` and `comment` via TonConnect
 * 4) POST /ton/purchase/confirm { purchaseId } -> credits purchase in DB and applies effect
 *
 * For now we verify payment by scanning receiver transactions via TON Center API v3.
 * Network is controlled by TON_NETWORK env (testnet/mainnet).
 */
function toncenterBaseUrl(): string {
  return config.tonNetwork === "mainnet"
    ? "https://toncenter.com/api/v3"
    : "https://testnet.toncenter.com/api/v3";
}

async function toncenterFetch<T = any>(
  path: string,
  params: Record<string, string | number | boolean>
): Promise<T> {
  const url = new URL(toncenterBaseUrl() + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const headers: Record<string, string> = {};
  if (config.toncenterApiKey) headers["X-Api-Key"] = config.toncenterApiKey;

  const resp = await fetch(url.toString(), { headers });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`toncenter_${resp.status}: ${txt.slice(0, 200)}`);
  }
  return (await resp.json()) as T;
}


function tonToNanoStr(ton: number): string {
  // 1 TON = 1e9 nanotons
  const nano = BigInt(Math.round(ton * 1_000_000_000));
  return nano.toString();
}

type TonPurchaseKind = "boost" | "upgrade_weapon_5" | "upgrade_range_5";

function kindToItem(kind: TonPurchaseKind) {
  switch (kind) {
    case "boost":
      return "BOOST";
    case "upgrade_weapon_5":
      return "UPGRADE_WEAPON_5";
    case "upgrade_range_5":
      return "UPGRADE_RANGE_5";
  }
}

function kindAmountNano(kind: TonPurchaseKind): bigint {
  switch (kind) {
    case "boost":
      return BigInt(Math.round(BOOST_TON_COST * 1_000_000_000));
    case "upgrade_weapon_5":
      return BigInt(Math.round(LEVEL5_TON_COST * 1_000_000_000));
    case "upgrade_range_5":
      return BigInt(Math.round(LEVEL5_TON_COST * 1_000_000_000));
  }
}

async function applyTonPurchase(uid: string, kind: TonPurchaseKind) {
  const now = new Date();

  if (kind === "boost") {
    // refill energy to max (100) and start cooldown
    const updated = await prisma.user.update({
      where: { id: uid },
      data: {
        energy: ENERGY_MAX,
        energyUpdatedAt: now,
        boostCooldownUntil: new Date(now.getTime() + BOOST_COOLDOWN_MS),
      },
    });
    return updated;
  }

  if (kind === "upgrade_weapon_5") {
    const u = await prisma.user.findUnique({ where: { id: uid } });
    if (!u) throw new Error("user_not_found");
    if (u.weaponLevel !== 4) throw new Error("need_level_4");
    const updated = await prisma.user.update({
      where: { id: uid },
      data: { weaponLevel: 5 },
    });
    return updated;
  }

  if (kind === "upgrade_range_5") {
    const u = await prisma.user.findUnique({ where: { id: uid } });
    if (!u) throw new Error("user_not_found");
    if (u.rangeLevel !== 4) throw new Error("need_level_4");
    const updated = await prisma.user.update({
      where: { id: uid },
      data: { rangeLevel: 5 },
    });
    return updated;
  }

  throw new Error("unknown_purchase");
}

router.post("/ton/wallet/set", requireAuth, async (req, res) => {
  const { uid } = (req as AuthedRequest).auth;
  const schema = z.object({ address: z.string().min(10).max(128) });
  const { address } = schema.parse(req.body);

  const updated = await prisma.user.update({
    where: { id: uid },
    data: { tonWalletAddress: address, tonWalletUpdatedAt: new Date() },
  });

  return res.json({ ok: true, address: updated.tonWalletAddress });
});

router.post("/ton/purchase/intent", requireAuth, async (req, res) => {
  const { uid } = (req as AuthedRequest).auth;

  const schema = z.object({ purchase: z.enum(["boost", "upgrade_weapon_5", "upgrade_range_5"]) });
  const { purchase } = schema.parse(req.body);
  const kind = purchase as TonPurchaseKind;

  if (!config.tonReceiverAddress) {
    return res.status(500).json({ error: "ton_receiver_not_configured" });
  }

  // Eligibility checks (fail early)
  if (kind === "boost") {
    const u = await prisma.user.findUnique({ where: { id: uid } });
    if (!u) return res.status(404).json({ error: "user_not_found" });
    if (u.boostCooldownUntil && u.boostCooldownUntil.getTime() > Date.now()) {
      return res.status(409).json({ error: "boost_cooldown" });
    }
  } else if (kind === "upgrade_weapon_5") {
    const u = await prisma.user.findUnique({ where: { id: uid } });
    if (!u) return res.status(404).json({ error: "user_not_found" });
    if (u.weaponLevel !== 4) return res.status(409).json({ error: "need_level_4" });
  } else if (kind === "upgrade_range_5") {
    const u = await prisma.user.findUnique({ where: { id: uid } });
    if (!u) return res.status(404).json({ error: "user_not_found" });
    if (u.rangeLevel !== 4) return res.status(409).json({ error: "need_level_4" });
  }

  const amountNano = kindAmountNano(kind);
  const comment = `TS:${uid}:${purchase}:${randomUUID().slice(0, 8)}`;
  const receiver = config.tonReceiverAddress;

  const created = await prisma.purchase.create({
    data: {
      userId: uid,
      item: kindToItem(kind) as any,
      amountNano,
      receiver,
      comment,
      status: "PENDING" as any,
    },
  });

  const validUntil = Math.floor(Date.now() / 1000) + 10 * 60;

  return res.json({
    ok: true,
    purchaseId: created.id,
    receiver,
    amountNano: amountNano.toString(),
    amountTon: (Number(amountNano) / 1_000_000_000).toString(),
    comment,
    validUntil,
    network: config.tonNetwork,
  });
});

router.post("/ton/purchase/confirm", requireAuth, async (req, res) => {
  const { uid } = (req as AuthedRequest).auth;
  const schema = z.object({ purchaseId: z.string().min(1) });
  const { purchaseId } = schema.parse(req.body);

  const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase || purchase.userId !== uid) return res.status(404).json({ error: "purchase_not_found" });

  if (purchase.status === ("PAID" as any)) {
    const u = await prisma.user.findUnique({ where: { id: uid } });
    return res.json({
      ok: true,
      status: "PAID",
      balances: { coins: u?.coins.toString() ?? "0", crystals: u?.crystals.toString() ?? "0", tonBalance: u?.tonBalance.toString() ?? "0" },
    });
  }

  // Scan last transactions of receiver account in TON Center v3
  const data = await toncenterFetch<{ transactions?: any[] }>("/transactions", {
  account: purchase.receiver,
  limit: 25,
  sort: "desc",
});
  const txs = data.transactions ?? [];
  

  const expectedValue = purchase.amountNano.toString();
  const expectedComment = purchase.comment;

  // If user saved wallet address, prefer checking sender
  const user = await prisma.user.findUnique({ where: { id: uid } });
  const expectedSender = user?.tonWalletAddress ?? undefined;

  const matched = txs.find((t) => {
    const inMsg = t?.in_msg;
    if (!inMsg) return false;
    if (String(inMsg?.value ?? "") !== expectedValue) return false;

    const comment = inMsg?.message_content?.decoded?.comment;
    if (String(comment ?? "") !== expectedComment) return false;

    const src = inMsg?.source;
    if (expectedSender && String(src ?? "") !== expectedSender) return false;

    // Must be ordinary transaction (best-effort)
    if (t?.description?.type && String(t.description.type) !== "ord") return false;
    return true;
  });

  if (!matched) {
    return res.status(409).json({ error: "payment_not_found_yet" });
  }

  const kind = (() => {
    switch (purchase.item) {
      case "BOOST":
        return "boost";
      case "UPGRADE_WEAPON_5":
        return "upgrade_weapon_5";
      case "UPGRADE_RANGE_5":
        return "upgrade_range_5";
      default:
        return null;
    }
  })() as TonPurchaseKind | null;

  if (!kind) return res.status(500).json({ error: "unknown_purchase_item" });

  const sender = matched?.in_msg?.source ? String(matched.in_msg.source) : undefined;
  const txHash = matched?.hash ? String(matched.hash) : undefined;

  // Mark PAID then apply effect (idempotency by purchase.status)
  let updatedUser: any;
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.purchase.findUnique({ where: { id: purchaseId } });
    if (!fresh) throw new Error("purchase_not_found");
    if (fresh.status === ("PAID" as any)) return;

    await tx.purchase.update({
      where: { id: purchaseId },
      data: {
        status: "PAID" as any,
        paidAt: new Date(),
        sender,
        txHash,
      },
    });
  });

  // Apply effect outside transaction to reuse existing prisma helpers (safe because purchase already PAID)
  updatedUser = await applyTonPurchase(uid, kind);

  await logAction(uid, "ton_purchase_paid", { purchaseId, kind, sender, txHash });

  return res.json({
    ok: true,
    status: "PAID",
    balances: {
      coins: updatedUser.coins.toString(),
      crystals: updatedUser.crystals.toString(),
      tonBalance: updatedUser.tonBalance.toString(),
      energy: updatedUser.energy,
    },
  });
});


/**
 * DEV: mock TON purchase flow
 * In production this should be disabled. Controlled by config.allowMockTon
 *
 * purchase:
 * - boost: buy energy refill (1 TON)
 * - upgrade_weapon_5: upgrade weapon from 4 -> 5 (2 TON)
 * - upgrade_range_5: upgrade range from 4 -> 5 (2 TON)
 */
router.post("/ton/purchase/mock", requireAuth, async (req, res) => {
  if (!config.allowMockTon) return res.status(403).json({ error: "mock_disabled" });

  const { uid } = (req as AuthedRequest).auth;
  const now = new Date();

  const schema = z.object({
    purchase: z.enum(["boost", "upgrade_weapon_5", "upgrade_range_5"]),
  });
  const { purchase } = schema.parse(req.body ?? {});

  const user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user) return res.status(404).json({ error: "not_found" });

  if (purchase === "boost") {
    const cooldownUntil = user.boostCooldownUntil?.getTime() ?? 0;
    if (cooldownUntil > now.getTime()) {
      return res.status(409).json({ error: "boost_cooldown", until: user.boostCooldownUntil?.toISOString() });
    }

    const nextCooldown = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    const updated = await prisma.user.update({
      where: { id: uid },
      data: {
        energy: ENERGY_MAX,
        energyUpdatedAt: now,
        boostActiveUntil: null,
        boostCooldownUntil: nextCooldown,
      },
    });

    await logAction(uid, "ton_payment_mock", { purchase, ton: BOOST_TON_COST });
    await logAction(uid, "boost", { kind: "energy_refill", via: "mock" });

    return res.json({
      ok: true,
      purchase,
      energy: updated.energy,
      boostCooldownUntil: updated.boostCooldownUntil?.toISOString() ?? null,
    });
  }

  if (purchase === "upgrade_weapon_5") {
    if (user.weaponLevel !== 4) return res.status(409).json({ error: "invalid_level", message: "weapon must be level 4" });
    const check = canUpgrade(user.weaponLevel + 1, user.rangeLevel, "weapon");
    if (!check.ok) return res.status(409).json({ error: "upgrade_blocked", reason: check.reason });

    const updated = await prisma.user.update({ where: { id: uid }, data: { weaponLevel: 5 } });
    await logAction(uid, "ton_payment_mock", { purchase, ton: UPGRADE_TO_LEVEL5_TON_COST });
    await logAction(uid, "upgrade", { which: "weapon", to: 5, via: "mock" });
    return res.json({ ok: true, purchase, weaponLevel: updated.weaponLevel, rangeLevel: updated.rangeLevel });
  }

  if (purchase === "upgrade_range_5") {
    if (user.rangeLevel !== 4) return res.status(409).json({ error: "invalid_level", message: "range must be level 4" });
    const check = canUpgrade(user.weaponLevel, user.rangeLevel + 1, "range");
    if (!check.ok) return res.status(409).json({ error: "upgrade_blocked", reason: check.reason });

    const updated = await prisma.user.update({ where: { id: uid }, data: { rangeLevel: 5 } });
    await logAction(uid, "ton_payment_mock", { purchase, ton: UPGRADE_TO_LEVEL5_TON_COST });
    await logAction(uid, "upgrade", { which: "range", to: 5, via: "mock" });
    return res.json({ ok: true, purchase, weaponLevel: updated.weaponLevel, rangeLevel: updated.rangeLevel });
  }

  return res.status(400).json({ error: "unknown_purchase" });
});

/**
 * Start a shot session (server defines difficulty parameters)
 */
router.post("/shot/start", requireAuth, async (req, res) => {
  const { uid } = (req as AuthedRequest).auth;
  const now = new Date();

  const ab = await antibotCheckAndMaybeFlag(uid, "shot_start", now);
  if (ab.blocked) return res.status(403).json({ error: "bot_suspected" });

  const user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user) return res.status(404).json({ error: "not_found" });

  const regen = applyEnergyRegen(user.energy, user.energyUpdatedAt, now);

  const baseCost = energyCost(user.weaponLevel, user.rangeLevel);
  const boostActive = user.boostActiveUntil ? user.boostActiveUntil.getTime() > now.getTime() : false;
  const cost = energyCostWithBoost(baseCost, boostActive);

  if (regen.energy < cost) {
    return res.status(409).json({ error: "no_energy", energy: regen.energy, cost });
  }

  // difficulty-based params (2 modes выпадут сами)
  // plus: after 3 hits in a row sometimes enable moving green zone
  const params = difficultyToParams(user.difficulty);

  const session = await prisma.shotSession.create({
    data: {
      userId: uid,
      difficulty: user.difficulty,
      zoneCenter: params.zoneCenter,
      zoneWidth: params.zoneWidth,
      speed: params.speed,
      zoneMoves: !!params.zoneMoves,
      zonePhase: params.zonePhase ?? 0,
      baseStartedAt: now,
    },
  });

  await logAction(uid, "shot_start", {
    sessionId: session.id,
    difficulty: user.difficulty,
    mode: params.mode,
  });

  return res.json({
    sessionId: session.id,
    serverStartedAt: now.toISOString(),
    difficulty: user.difficulty,
    zoneCenter: params.zoneCenter,
    zoneWidth: params.zoneWidth,
    speed: params.speed,
    zoneMoves: !!params.zoneMoves,
    zonePhase: params.zonePhase ?? 0,
    energyCost: cost,
    mode: params.mode, // не обязательно показывать игроку, но полезно для дебага
  });
});

/**
 * Fire: server computes hit/miss from elapsed time.
 */
router.post("/shot/fire", requireAuth, async (req, res) => {
  const { uid } = (req as AuthedRequest).auth;
  const now = new Date();

  const schema = z.object({
    sessionId: z.string().min(1),
    clientElapsedMs: z.number().int().min(0).max(60_000),
  });
  const { sessionId, clientElapsedMs } = schema.parse(req.body);

  const ab = await antibotCheckAndMaybeFlag(uid, "shot_fire", now);
  if (ab.blocked) return res.status(403).json({ error: "bot_suspected" });

  const session = await prisma.shotSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== uid) return res.status(404).json({ error: "session_not_found" });
  if (session.used) return res.status(409).json({ error: "session_used" });

  const serverElapsedMs = now.getTime() - session.baseStartedAt.getTime();
  const delta = Math.abs(serverElapsedMs - clientElapsedMs);

  // КЛЮЧЕВОЙ ФИКС: если рассинхрон небольшой — верим клиенту,
  // чтобы “зелёная зона = попадание” совпадало с тем, что видит игрок.
  // Если рассинхрон огромный — тогда повышаем подозрение и используем сервер.
  const DRIFT_OK_MS = 1800;
  let elapsedUsed = serverElapsedMs;

  if (delta <= DRIFT_OK_MS) {
    elapsedUsed = clientElapsedMs;
  } else {
    await prisma.user.update({ where: { id: uid }, data: { suspicionScore: { increment: 1 } } });
  }

  const user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user) return res.status(404).json({ error: "not_found" });

  // regen + cost
  const regen = applyEnergyRegen(user.energy, user.energyUpdatedAt, now);

  const baseCost = energyCost(user.weaponLevel, user.rangeLevel);
  const boostActive = user.boostActiveUntil ? user.boostActiveUntil.getTime() > now.getTime() : false;
  const cost = energyCostWithBoost(baseCost, boostActive);

  if (regen.energy < cost) {
    await prisma.shotSession.update({ where: { id: sessionId }, data: { used: true } });
    return res.status(409).json({ error: "no_energy" });
  }

  // Decide hit
  const pos = positionAt(elapsedUsed, session.speed);
  // If zone is moving, compute its center at the same elapsed time.
  const zoneCenterUsed = session.zoneMoves
    ? zoneCenterAt(elapsedUsed, session.zoneWidth, session.speed, session.zonePhase)
    : session.zoneCenter;
  const hit = isHit(pos, zoneCenterUsed, session.zoneWidth);

  const coinsAward = hit ? BigInt(coinsForHit(user.weaponLevel, user.rangeLevel)) : BigInt(0);
  const nextDifficulty = hit ? user.difficulty + 1 : 0;

  // --- Referral progress (TЗ: "активный реферал") ---
  // Conditions are tracked for the INVITED user (the one who has referrerId).
  // When invited user reaches thresholds within the window, reward is credited to referrer.
  const hasReferrer = !!user.referrerId;
  const windowMs = REFERRAL_ACTIVE_WINDOW_HOURS * 60 * 60 * 1000;
  const withinWindow = now.getTime() - user.createdAt.getTime() <= windowMs;

  const nextShotsCount = user.shotsCount + 1;
  const nextHitsCount = user.hitsCount + (hit ? 1 : 0);

  const qualifiesNow =
    hasReferrer &&
    !user.referralQualifiedAt &&
    withinWindow &&
    nextShotsCount >= REFERRAL_ACTIVE_SHOTS &&
    nextHitsCount >= REFERRAL_ACTIVE_HITS;

  const shouldTryReward =
    hasReferrer &&
    (qualifiesNow || (!!user.referralQualifiedAt && !user.referralRewardedAt));

  let rewardedReferral = false;

  const updated = await prisma.$transaction(async (tx) => {
    // Update current user state + referral counters
    const data: Prisma.UserUpdateInput = {
      coins: { increment: coinsAward },
      energy: regen.energy - cost,
      energyUpdatedAt: regen.updatedAt,
      difficulty: nextDifficulty,
      shotsCount: { increment: 1 },
      hitsCount: { increment: hit ? 1 : 0 },
      ...(qualifiesNow ? { referralQualifiedAt: now } : {}),
    };

    if (shouldTryReward && user.referrerId) {
      // Daily cap is applied per referrer in a rolling 24h window.
      const capCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const rewardedLast24h = await tx.user.count({
        where: { referrerId: user.referrerId, referralRewardedAt: { gte: capCutoff } },
      });

      if (rewardedLast24h < config.referralDailyCap) {
        (data as any).referralRewardedAt = now;
        rewardedReferral = true;

        await tx.user.update({
          where: { id: user.referrerId },
          data: { coins: { increment: BigInt(REFERRAL_REWARD_COINS) } },
        });
      }
    }

    return await tx.user.update({ where: { id: uid }, data });
  });

  await prisma.shotSession.update({ where: { id: sessionId }, data: { used: true } });

  await logAction(uid, "shot_fire", {
    sessionId,
    hit,
    pos,
    cost,
    delta,
    elapsedUsed,
    coinsAward: coinsAward.toString(),
  });

  if (rewardedReferral && user.referrerId) {
    await logAction(user.referrerId, "referral_reward", {
      invitedUserId: uid,
      coins: REFERRAL_REWARD_COINS,
    });
  }

  return res.json({
    hit,
    pos: Number(pos.toFixed(4)),
    zoneCenter: zoneCenterUsed,
    zoneWidth: session.zoneWidth,
    speed: session.speed,
    zoneMoves: session.zoneMoves,
    zonePhase: session.zonePhase,
    coinsAward: coinsAward.toString(),
    energy: updated.energy,
    difficulty: updated.difficulty,
    balances: {
      coins: updated.coins.toString(),
      crystals: updated.crystals.toString(),
      tonBalance: updated.tonBalance.toString(),
    },
  });
});

/**
 * Upgrade weapon / range
 */
router.post("/upgrade", requireAuth, async (req, res) => {
  const { uid } = (req as AuthedRequest).auth;
  const now = new Date();

  const schema = z.object({ which: z.enum(["weapon", "range"]) });
  const { which } = schema.parse(req.body);

  const ab = await antibotCheckAndMaybeFlag(uid, "upgrade", now);
  if (ab.blocked) return res.status(403).json({ error: "bot_suspected" });

  const user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user) return res.status(404).json({ error: "not_found" });

  const can = canUpgrade(user.weaponLevel, user.rangeLevel, which);
  if (!can.ok) return res.status(409).json({ error: "upgrade_blocked", reason: can.reason });

  const currentLevel = which === "weapon" ? user.weaponLevel : user.rangeLevel;
  const nextLevel = currentLevel + 1;

  // Project rule: upgrade to level 5 is paid only by TON (not coins)
  if (nextLevel === 5) {
    const tonBalance = Number(user.tonBalance);
    if (tonBalance < UPGRADE_TO_LEVEL5_TON_COST) {
      return res.status(409).json({ error: "not_enough_ton" });
    }

    const data: any = {
      tonBalance: { decrement: new Prisma.Decimal(UPGRADE_TO_LEVEL5_TON_COST) },
    };
    if (which === "weapon") data.weaponLevel = { increment: 1 };
    if (which === "range") data.rangeLevel = { increment: 1 };

    const updated = await prisma.user.update({ where: { id: uid }, data });
    await logAction(uid, "upgrade", { which, ton: UPGRADE_TO_LEVEL5_TON_COST, toLevel: 5 });

    return res.json({
      weaponLevel: updated.weaponLevel,
      rangeLevel: updated.rangeLevel,
      coins: updated.coins.toString(),
      tonBalance: updated.tonBalance.toString(),
    });
  }

  const price = upgradePrice(currentLevel);
  if (!price) return res.status(409).json({ error: "upgrade_unavailable" });
  if (user.coins < BigInt(price)) return res.status(409).json({ error: "not_enough_coins" });

  const data: any = { coins: { decrement: BigInt(price) } };
  if (which === "weapon") data.weaponLevel = { increment: 1 };
  if (which === "range") data.rangeLevel = { increment: 1 };

  const updated = await prisma.user.update({ where: { id: uid }, data });
  await logAction(uid, "upgrade", { which, price, toLevel: nextLevel });

  return res.json({
    weaponLevel: updated.weaponLevel,
    rangeLevel: updated.rangeLevel,
    coins: updated.coins.toString(),
    tonBalance: updated.tonBalance.toString(),
  });
});

/**
 * Exchange:
 * - coins -> crystals (100_000 coins = 1 crystal)
 * - crystals -> tonBalance (100 crystals = 1 ton)
 */
router.post("/exchange", requireAuth, async (req, res) => {
  const { uid } = (req as AuthedRequest).auth;

  const schema = z.object({
    direction: z.enum(["coins_to_crystals", "crystals_to_ton"]),
    amount: z.number().int().positive(),
  });
  const { direction, amount } = schema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user) return res.status(404).json({ error: "not_found" });

  if (direction === "coins_to_crystals") {
    const coinsNeed = BigInt(amount) * BigInt(COINS_PER_CRYSTAL);
    if (user.coins < coinsNeed) return res.status(409).json({ error: "not_enough_coins" });

    const updated = await prisma.user.update({
      where: { id: uid },
      data: { coins: { decrement: coinsNeed }, crystals: { increment: BigInt(amount) } },
    });

    return res.json({ coins: updated.coins.toString(), crystals: updated.crystals.toString() });
  }

  const crystalsNeed = BigInt(amount) * BigInt(CRYSTALS_PER_TON);
  if (user.crystals < crystalsNeed) return res.status(409).json({ error: "not_enough_crystals" });

  const tonAdd = amount;
  const updated = await prisma.user.update({
    where: { id: uid },
    data: {
      crystals: { decrement: crystalsNeed },
      tonBalance: { increment: new Prisma.Decimal(tonAdd) },
    },
  });

  return res.json({ crystals: updated.crystals.toString(), tonBalance: updated.tonBalance.toString() });
});

/**
 * Boost (energy refill): can be bought only for TON.
 * Effect: sets energy to full (100). Cooldown: 6 hours.
 */
router.post("/boost/buy", requireAuth, async (req, res) => {
  const { uid } = (req as AuthedRequest).auth;
  const now = new Date();

  const schema = z.object({ method: z.enum(["crystals", "ton"]).optional() }).optional();
  const parsed = schema.parse(req.body ?? {});
  const method = (parsed as any)?.method ?? "ton";

  const user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user) return res.status(404).json({ error: "not_found" });

  const cooldownUntil = user.boostCooldownUntil?.getTime() ?? 0;
  if (cooldownUntil > now.getTime()) {
    return res.status(409).json({ error: "boost_cooldown", until: user.boostCooldownUntil?.toISOString() });
  }

  if (method !== "ton") {
    return res.status(409).json({ error: "boost_only_ton" });
  }

  const tonBalance = Number(user.tonBalance);
  if (tonBalance < BOOST_TON_COST) return res.status(409).json({ error: "not_enough_ton" });

  const nextCooldown = new Date(now.getTime() + 6 * 60 * 60 * 1000);

  const updated = await prisma.user.update({
    where: { id: uid },
    data: {
      tonBalance: { decrement: new Prisma.Decimal(BOOST_TON_COST) },
      energy: ENERGY_MAX,
      energyUpdatedAt: now,
      boostActiveUntil: null,
      boostCooldownUntil: nextCooldown,
    },
  });

  await logAction(uid, "boost", { kind: "energy_refill", ton: BOOST_TON_COST });

  return res.json({
    ok: true,
    energy: updated.energy,
    tonBalance: updated.tonBalance.toString(),
    boostCooldownUntil: updated.boostCooldownUntil?.toISOString() ?? null,
  });
});

/**
 * Tasks list and claim
 */
router.get("/tasks", requireAuth, async (req, res) => {
  const { uid } = (req as AuthedRequest).auth;

  const tasks = await prisma.task.findMany({ where: { isActive: true }, orderBy: { createdAt: "desc" } });
  const claims = await prisma.taskClaim.findMany({ where: { userId: uid }, select: { taskId: true } });
  const opens = await prisma.taskOpen.findMany({ where: { userId: uid }, select: { taskId: true } });
  const claimedSet = new Set(claims.map((c) => c.taskId));
  const openedSet = new Set(opens.map((o) => o.taskId));

  return res.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      chatId: t.chatId,
      url: t.url,
      cap: t.cap,
      completedCount: t.completedCount,
      requireSubscriptionCheck: t.requireSubscriptionCheck,
      opened: openedSet.has(t.id),
      rewardType: t.rewardType,
      rewardValue: t.rewardValue,
      claimed: claimedSet.has(t.id),
    })),
  });
});

// Track that the user has opened the task link. This is required before claim (even in "click" mode).

// Create openToken when user clicks "Перейти"
router.post("/tasks/open", requireAuth, (req, res, next) => {
  (async () => {
    const { uid } = (req as AuthedRequest).auth;
    const now = new Date();

    const schema = z.object({ taskId: z.string().min(1) });
    const { taskId } = schema.parse(req.body);

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || !task.isActive) return res.status(404).json({ error: "task_not_found" });

    const openToken = randomUUID();
    const openTokenExpiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 минут

    await prisma.taskOpen.upsert({
      where: { userId_taskId: { userId: uid, taskId } },
      update: { openedAt: now, openToken, openTokenExpiresAt },
      create: { userId: uid, taskId, openedAt: now, openToken, openTokenExpiresAt },
    });

    return res.json({
      ok: true,
      openToken,
      openTokenExpiresAt: openTokenExpiresAt.toISOString(),
    });
  })().catch(next);
});


// Claim task reward (requires prior /tasks/open -> openToken)
router.post("/tasks/claim", requireAuth, (req, res, next) => {
  (async () => {
    const { uid, tgUserId } = (req as AuthedRequest).auth;
    const now = new Date();

    const schema = z.object({
      taskId: z.string().min(1),
      openToken: z.string().uuid(),
    });
    const { taskId, openToken } = schema.parse(req.body);

    const ab = await antibotCheckAndMaybeFlag(uid, "task_claim", now);
    if (ab.blocked) return res.status(403).json({ error: "bot_suspected" });

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || !task.isActive) return res.status(404).json({ error: "task_not_found" });

    // Must open first (fast pre-check)
    const opened = await prisma.taskOpen.findUnique({
      where: { userId_taskId: { userId: uid, taskId } },
    });

    if (!opened) return res.status(409).json({ error: "need_open_first" });
    if (!opened.openToken || opened.openToken !== openToken) return res.status(409).json({ error: "need_open_first" });
    if (opened.openTokenExpiresAt && opened.openTokenExpiresAt.getTime() < Date.now()) {
      return res.status(409).json({ error: "need_open_first" });
    }

    // One user — one reward
    const already = await prisma.taskClaim.findUnique({
      where: { userId_taskId: { userId: uid, taskId } },
    });
    if (already) return res.status(409).json({ error: "already_claimed" });

    // If required — check Telegram subscription
    if (task.requireSubscriptionCheck) {
      const isMember = await checkChatMember(task.chatId, tgUserId.toString(), config.botToken);
      if (!isMember) return res.status(409).json({ error: "not_subscribed" });
    }

    try {
      const updatedUser = await prisma.$transaction(async (tx) => {
        // Re-check inside transaction (race-safe)
        const [t, o, c] = await Promise.all([
          tx.task.findUnique({ where: { id: taskId } }),
          tx.taskOpen.findUnique({ where: { userId_taskId: { userId: uid, taskId } } }),
          tx.taskClaim.findUnique({ where: { userId_taskId: { userId: uid, taskId } } }),
        ]);

        if (!t || !t.isActive) throw new Error("task_not_found");
        if (c) throw new Error("already_claimed");

        if (!o || !o.openToken || o.openToken !== openToken) throw new Error("need_open_first");
        if (o.openTokenExpiresAt && o.openTokenExpiresAt.getTime() < Date.now()) throw new Error("need_open_first");

        // Cap check (0 = unlimited)
        if (t.cap > 0 && t.completedCount >= t.cap) {
          await tx.task.update({ where: { id: taskId }, data: { isActive: false } }).catch(() => undefined);
          throw new Error("task_limit_reached");
        }

        await tx.taskClaim.create({ data: { userId: uid, taskId } });

        const nextCompleted = t.completedCount + 1;
        await tx.task.update({
          where: { id: taskId },
          data: {
            completedCount: { increment: 1 },
            ...(t.cap > 0 && nextCompleted >= t.cap ? { isActive: false } : {}),
          },
        });

        await tx.taskOpen.update({
          where: { userId_taskId: { userId: uid, taskId } },
          data: { openToken: null, openTokenExpiresAt: null },
        });

        const u = await tx.user.update({
          where: { id: uid },
          data:
            t.rewardType === RewardType.COINS
              ? { coins: { increment: BigInt(t.rewardValue) } }
              : { crystals: { increment: BigInt(t.rewardValue) } },
        });

        return u;
      });

      await logAction(uid, "task_claim", { taskId });

      return res.json({
        ok: true,
        coins: updatedUser.coins.toString(),
        crystals: updatedUser.crystals.toString(),
      });
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg === "task_limit_reached") return res.status(409).json({ error: "task_limit_reached" });
      if (msg === "task_not_found") return res.status(404).json({ error: "task_not_found" });
      if (msg === "already_claimed") return res.status(409).json({ error: "already_claimed" });
      if (msg === "need_open_first") return res.status(409).json({ error: "need_open_first" });
      throw e;
    }
  })().catch(next);
});
/**
 * Withdraw TON
 */
router.post("/withdraw", requireAuth, async (req, res) => {
  const { uid } = (req as AuthedRequest).auth;
  const now = new Date();

  const schema = z.object({
    amountTon: z.number().positive(),
    address: z.string().min(10),
  });
  const { amountTon, address } = schema.parse(req.body);

  const ab = await antibotCheckAndMaybeFlag(uid, "withdraw", now);
  if (ab.blocked) return res.status(403).json({ error: "bot_suspected" });

  if (amountTon < 1) return res.status(409).json({ error: "min_withdraw_1_ton" });
  if (amountTon > 25) return res.status(409).json({ error: "max_withdraw_25_ton" });

  const user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user) return res.status(404).json({ error: "not_found" });

  // Withdraw is unlocked only after at least 1 rewarded (active) referral.
  const activeReferralCount = await prisma.user.count({
    where: { referrerId: uid, referralRewardedAt: { not: null } },
  });
  if (activeReferralCount < 1) {
    return res.status(409).json({
      error: "withdraw_locked_need_referral",
      needed: 1,
      have: activeReferralCount,
    });
  }

  if (user.lastWithdrawalAt) {
    const delta = now.getTime() - user.lastWithdrawalAt.getTime();
    if (delta < 24 * 60 * 60 * 1000) {
      return res.status(409).json({
        error: "withdraw_cooldown_24h",
        until: new Date(user.lastWithdrawalAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      });
    }
  }

  const tonBalance = Number(user.tonBalance);
  if (tonBalance < amountTon) return res.status(409).json({ error: "not_enough_ton" });

  const devFee = (amountTon * config.devFeeBps) / 10_000;
  const devFeeRounded = Number(devFee.toFixed(9));

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: uid },
      data: {
        tonBalance: { decrement: new Prisma.Decimal(amountTon) },
        lastWithdrawalAt: now,
      },
    });

    await tx.withdrawal.create({
      data: {
        userId: uid,
        amountTon,
        address,
        devFeeTon: new Prisma.Decimal(devFeeRounded),
      },
    });

    return u;
  });

  return res.json({ ok: true, tonBalance: updated.tonBalance.toString(), devFee: devFeeRounded });
});

router.get("/profile/referral", requireAuth, async (req, res) => {
  const { uid } = (req as AuthedRequest).auth;

  const user = await prisma.user.findUnique({ where: { id: uid }, select: { tgUserId: true } });
  if (!user) return res.status(404).json({ error: "not_found" });

  const payload = `ref_${user.tgUserId.toString()}`;
  const referralCount = await prisma.user.count({ where: { referrerId: uid } });

  return res.json({ payload, referralCount });
});

type TgGetChatMemberOk = {
  ok: true;
  result: {
    status: string; // "creator" | "administrator" | "member" | ...
  };
};

type TgGetChatMemberErr = {
  ok: false;
  description?: string;
  error_code?: number;
};

type TgGetChatMemberResp = TgGetChatMemberOk | TgGetChatMemberErr;

async function checkChatMember(chatId: string, userId: string, botToken: string): Promise<boolean> {
  const url = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${encodeURIComponent(
    chatId
  )}&user_id=${encodeURIComponent(userId)}`;

  const resp = await fetch(url);
  if (!resp.ok) return false;

  const json = (await resp.json()) as TgGetChatMemberResp;
  if (!json || json.ok !== true) return false;

  const status = json.result?.status;
  return status === "member" || status === "administrator" || status === "creator";
}
