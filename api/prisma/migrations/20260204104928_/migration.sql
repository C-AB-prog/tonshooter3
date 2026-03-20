-- CreateEnum
CREATE TYPE "PurchaseItem" AS ENUM ('BOOST', 'UPGRADE_WEAPON_5', 'UPGRADE_RANGE_5');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- DropForeignKey
ALTER TABLE "TaskOpen" DROP CONSTRAINT "TaskOpen_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskOpen" DROP CONSTRAINT "TaskOpen_userId_fkey";

-- DropIndex
DROP INDEX "User_referrerId_referralRewardedAt_idx";

-- AlterTable
ALTER TABLE "TaskOpen" ADD COLUMN     "openToken" TEXT,
ADD COLUMN     "openTokenExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tonWalletAddress" TEXT,
ADD COLUMN     "tonWalletUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Withdrawal" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "txHash" TEXT;

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "item" "PurchaseItem" NOT NULL,
    "amountNano" BIGINT NOT NULL,
    "receiver" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "sender" TEXT,
    "txHash" TEXT,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Purchase_userId_createdAt_idx" ON "Purchase"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_receiver_comment_key" ON "Purchase"("receiver", "comment");

-- AddForeignKey
ALTER TABLE "TaskOpen" ADD CONSTRAINT "TaskOpen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOpen" ADD CONSTRAINT "TaskOpen_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
