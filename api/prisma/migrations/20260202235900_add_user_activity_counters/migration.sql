-- Add activity counters used for referral qualification and analytics
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "shotsCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hitsCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralQualifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralRewardedAt" TIMESTAMP(3);

-- Helpful index for counting rewarded referrals in last 24h
CREATE INDEX IF NOT EXISTS "User_referrerId_referralRewardedAt_idx" ON "User"("referrerId", "referralRewardedAt");
