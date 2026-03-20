-- CreateEnum
CREATE TYPE "ShotMode" AS ENUM ('PINGPONG', 'WRAP');

-- AlterTable
ALTER TABLE "ShotSession" ADD COLUMN     "mode" "ShotMode" NOT NULL DEFAULT 'PINGPONG';
