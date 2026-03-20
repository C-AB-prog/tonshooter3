import "dotenv/config";
import { Telegraf } from "telegraf";
import { PrismaClient, RewardType } from "@prisma/client";

const BOT_TOKEN = process.env.BOT_TOKEN!;
if (!BOT_TOKEN) throw new Error("BOT_TOKEN is required");

const ADMIN_IDS = (process.env.ADMIN_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const prisma = new PrismaClient();
const bot = new Telegraf(BOT_TOKEN);

function isAdmin(tgId: number): boolean {
  if (ADMIN_IDS.length === 0) return false;
  return ADMIN_IDS.includes(String(tgId));
}

bot.start(async (ctx) => {
  await ctx.reply(
    "Админ-бот TON Shooter.\n\nКоманды:\n" +
      "/task_list — список заданий\n" +
      "/task_add title | @channel | COINS|CRYSTALS | value | description\n" +
      "/task_toggle <taskId> — включить/выключить\n"
  );
});

bot.command("task_list", async (ctx) => {
  if (!isAdmin(ctx.from!.id)) return ctx.reply("Нет прав.");

  const tasks = await prisma.task.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  if (tasks.length === 0) return ctx.reply("Заданий нет.");

  const text = tasks
    .map(
      (t) =>
        `• ${t.id}\n  ${t.isActive ? "✅" : "⛔️"} ${t.title}\n  chat: ${t.chatId}\n  reward: ${t.rewardType} ${t.rewardValue}\n`
    )
    .join("\n");

  return ctx.reply(text);
});

bot.command("task_add", async (ctx) => {
  if (!isAdmin(ctx.from!.id)) return ctx.reply("Нет прав.");

  const raw = ctx.message?.text?.replace("/task_add", "").trim() ?? "";
  const parts = raw.split("|").map((s) => s.trim());

  if (parts.length < 5) {
    return ctx.reply("Формат:\n/task_add title | @channel | COINS|CRYSTALS | value | description");
  }

  const [title, chatId, rewardTypeStr, valueStr, description] = parts;
  const rewardType = rewardTypeStr === "CRYSTALS" ? RewardType.CRYSTALS : RewardType.COINS;
  const rewardValue = Number(valueStr);

  if (!chatId.startsWith("@") && !/^[-0-9]+$/.test(chatId)) {
    return ctx.reply("chatId должен быть @channelusername или числовой id.");
  }
  if (!Number.isFinite(rewardValue) || rewardValue <= 0) return ctx.reply("reward value должен быть > 0");

  const url = chatId.startsWith("@")
    ? `https://t.me/${chatId.slice(1)}`
    : `https://t.me/c/${String(chatId).replace("-100", "")}`;

  const task = await prisma.task.create({
    data: { title, description, chatId, url, rewardType, rewardValue, isActive: true },
  });

  return ctx.reply(`Создано: ${task.id}`);
});

bot.command("task_toggle", async (ctx) => {
  if (!isAdmin(ctx.from!.id)) return ctx.reply("Нет прав.");

  const raw = ctx.message?.text?.replace("/task_toggle", "").trim() ?? "";
  if (!raw) return ctx.reply("Формат: /task_toggle <taskId>");

  const task = await prisma.task.findUnique({ where: { id: raw } });
  if (!task) return ctx.reply("Не найдено.");

  const updated = await prisma.task.update({ where: { id: raw }, data: { isActive: !task.isActive } });
  return ctx.reply(`Теперь: ${updated.isActive ? "✅ active" : "⛔️ inactive"}`);
});

bot.launch().then(() => console.log("[bot] started"));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
