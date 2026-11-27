-- Audit hardening: precision, idempotency, TIMESTAMPTZ, revocable sessions, per-client rate limiting, indexes & CHECK constraints

-- 1. ProductionArea.surface precision
ALTER TABLE "ProductionArea"
  ALTER COLUMN "surface" TYPE DECIMAL(12,2);

-- 2. Shipment idempotency key
ALTER TABLE "Shipment"
  ADD COLUMN "requestId" TEXT;
CREATE UNIQUE INDEX "Shipment_requestId_key" ON "Shipment"("requestId");

-- 3. Reception.receivedAt timezone-aware (preserves existing UTC wall values)
ALTER TABLE "Reception"
  ALTER COLUMN "receivedAt" TYPE TIMESTAMPTZ(3)
  USING "receivedAt" AT TIME ZONE 'UTC';

-- 4. Per-client login rate limiting (prevents global lockout DoS)
ALTER TABLE "ProfileLoginAttempt"
  ADD COLUMN "clientKey" TEXT NOT NULL DEFAULT 'global',
  ALTER COLUMN "windowStart" TYPE TIMESTAMPTZ(3)
  USING "windowStart" AT TIME ZONE 'UTC';
ALTER TABLE "ProfileLoginAttempt" DROP CONSTRAINT "ProfileLoginAttempt_pkey";
ALTER TABLE "ProfileLoginAttempt" ADD CONSTRAINT "ProfileLoginAttempt_pkey" PRIMARY KEY ("profile", "clientKey");
CREATE INDEX "ProfileLoginAttempt_windowStart_idx" ON "ProfileLoginAttempt"("windowStart");

-- 5. Server-side revocable sessions
CREATE TABLE "ProfileSession" (
  "jti" TEXT NOT NULL,
  "profile" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfileSession_pkey" PRIMARY KEY ("jti")
);
CREATE INDEX "ProfileSession_profile_revokedAt_idx" ON "ProfileSession"("profile", "revokedAt");
CREATE INDEX "ProfileSession_expiresAt_idx" ON "ProfileSession"("expiresAt");

-- 6. Missing performance & SSI-contention indexes
CREATE INDEX "Crop_unitId_idx" ON "Crop"("unitId");
CREATE INDEX "ProductionArea_cropId_active_idx" ON "ProductionArea"("cropId", "active");
CREATE INDEX "Harvest_cropId_date_idx" ON "Harvest"("cropId", "date");
CREATE INDEX "Harvest_unitId_idx" ON "Harvest"("unitId");
CREATE INDEX "Loss_harvestId_affectsHarvest_idx" ON "Loss"("harvestId", "affectsHarvest");
CREATE INDEX "Loss_date_idx" ON "Loss"("date");
CREATE INDEX "Loss_reasonId_idx" ON "Loss"("reasonId");
CREATE INDEX "Cost_categoryId_idx" ON "Cost"("categoryId");
CREATE INDEX "Cost_subcategoryId_idx" ON "Cost"("subcategoryId");
CREATE INDEX "CostAllocation_cropId_idx" ON "CostAllocation"("cropId");
CREATE INDEX "ShipmentItem_unitId_idx" ON "ShipmentItem"("unitId");
CREATE INDEX "Reception_receivedAt_idx" ON "Reception"("receivedAt");

-- 7. Case-insensitive active uniqueness for Unit names
CREATE UNIQUE INDEX "Unit_lower_name_active_key" ON "Unit" (LOWER("name")) WHERE "deletedAt" IS NULL;

-- 8. Database-level integrity CHECK constraints
ALTER TABLE "ProductionArea"
  ADD CONSTRAINT "ProductionArea_surface_check" CHECK ("surface" IS NULL OR "surface" >= 0);

ALTER TABLE "Harvest"
  ADD CONSTRAINT "Harvest_quantity_check" CHECK ("quantity" > 0 AND ("estimatedUnitPrice" IS NULL OR "estimatedUnitPrice" > 0));

ALTER TABLE "Loss"
  ADD CONSTRAINT "Loss_quantity_check" CHECK ("quantity" > 0);

ALTER TABLE "Cost"
  ADD CONSTRAINT "Cost_amount_check" CHECK ("amountUsd" > 0);

ALTER TABLE "ShipmentItem"
  ADD CONSTRAINT "ShipmentItem_quantity_check" CHECK (
    "quantity" > 0
    AND ("estimatedUnitPrice" IS NULL OR "estimatedUnitPrice" > 0)
    AND ("estimatedTotalAmount" IS NULL OR "estimatedTotalAmount" > 0)
  );

ALTER TABLE "ShipmentAllocation"
  ADD CONSTRAINT "ShipmentAllocation_quantity_check" CHECK ("quantity" > 0);

ALTER TABLE "ReceptionItem"
  ADD CONSTRAINT "ReceptionItem_quantity_check" CHECK ("receivedQuantity" > 0);
