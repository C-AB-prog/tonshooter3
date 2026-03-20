-- Add task campaign fields: url, cap and subscription-check mode
ALTER TABLE "Task" ADD COLUMN "url" TEXT;
ALTER TABLE "Task" ADD COLUMN "cap" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Task" ADD COLUMN "completedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Task" ADD COLUMN "requireSubscriptionCheck" BOOLEAN NOT NULL DEFAULT false;

-- Backfill url for existing tasks (best-effort)
UPDATE "Task"
SET "url" = CASE
  WHEN "chatId" LIKE '@%' THEN 'https://t.me/' || substring("chatId" from 2)
  ELSE 'https://t.me/' || "chatId"
END
WHERE "url" IS NULL;

-- Safety backfill (in case chatId is empty/null)
UPDATE "Task"
SET "url" = 'https://t.me/'
WHERE "url" IS NULL;

-- Require url
ALTER TABLE "Task" ALTER COLUMN "url" SET NOT NULL;

-- Create TaskOpen table to require "open first" before claim
CREATE TABLE "TaskOpen" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskOpen_pkey" PRIMARY KEY ("id")
);

-- Foreign keys (PostgreSQL does NOT support "ADD CONSTRAINT IF NOT EXISTS")
ALTER TABLE "TaskOpen" ADD CONSTRAINT "TaskOpen_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskOpen" ADD CONSTRAINT "TaskOpen_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Uniqueness and indexes
CREATE UNIQUE INDEX "TaskOpen_userId_taskId_key" ON "TaskOpen"("userId", "taskId");
CREATE INDEX "TaskOpen_taskId_openedAt_idx" ON "TaskOpen"("taskId", "openedAt");
