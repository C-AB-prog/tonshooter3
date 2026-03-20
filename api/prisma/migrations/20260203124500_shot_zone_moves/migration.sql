-- Add moving zone fields for ShotSession
ALTER TABLE "ShotSession" ADD COLUMN     "zoneMoves" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShotSession" ADD COLUMN     "zonePhase" DOUBLE PRECISION NOT NULL DEFAULT 0;
