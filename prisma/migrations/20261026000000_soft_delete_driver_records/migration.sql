ALTER TABLE "driver_records"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedBy" VARCHAR(40);

CREATE INDEX "driver_records_deletedAt_idx" ON "driver_records"("deletedAt");
