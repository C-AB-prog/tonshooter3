import { PrismaClient, RewardType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create a couple example tasks (subscription tasks)
  const existing = await prisma.task.count();
  if (existing === 0) {
    await prisma.task.createMany({
      data: [
        {
          title: "Подпишись на канал партнёра #1",
          description: "Подпишись — получи награду.",
          chatId: "@example_channel_1",
          url: "https://t.me/example_channel_1",
          rewardType: RewardType.COINS,
          rewardValue: 150000,
        },
        {
          title: "Подпишись на канал партнёра #2",
          description: "Подпишись — получи кристаллы.",
          chatId: "@example_channel_2",
          url: "https://t.me/example_channel_2",
          rewardType: RewardType.CRYSTALS,
          rewardValue: 5,
        },
      ],
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
