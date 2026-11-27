-- DropIndex
DROP INDEX IF EXISTS "ReceptionItem_receptionId_shipmentItemId_key";

-- AlterTable
ALTER TABLE "ReceptionItem"
  ADD COLUMN "saleUnitId" TEXT,
  ADD COLUMN "saleQuantity" DECIMAL(12, 2),
  ADD COLUMN "saleUnitCost" DECIMAL(12, 4),
  ADD COLUMN "parentItemId" TEXT,
  ADD COLUMN "convertedFromQty" DECIMAL(12, 2),
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex (mantener unicidad de la línea primaria por recepción y envío)
CREATE UNIQUE INDEX "ReceptionItem_primary_reception_shipment_key"
  ON "ReceptionItem"("receptionId", "shipmentItemId")
  WHERE "parentItemId" IS NULL;

CREATE INDEX "ReceptionItem_receptionId_shipmentItemId_idx" ON "ReceptionItem"("receptionId", "shipmentItemId");
CREATE INDEX "ReceptionItem_parentItemId_idx" ON "ReceptionItem"("parentItemId");
CREATE INDEX "ReceptionItem_saleUnitId_idx" ON "ReceptionItem"("saleUnitId");

-- AddForeignKey
ALTER TABLE "ReceptionItem" ADD CONSTRAINT "ReceptionItem_saleUnitId_fkey"
  FOREIGN KEY ("saleUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReceptionItem" ADD CONSTRAINT "ReceptionItem_parentItemId_fkey"
  FOREIGN KEY ("parentItemId") REFERENCES "ReceptionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "MarketReferencePrice" (
  "id" TEXT NOT NULL,
  "cropId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "marketName" TEXT NOT NULL DEFAULT 'Mercado local (Manabí)',
  "source" TEXT NOT NULL DEFAULT 'Referencia local',
  "priceUsd" DECIMAL(12, 2) NOT NULL,
  "minPriceUsd" DECIMAL(12, 2),
  "maxPriceUsd" DECIMAL(12, 2),
  "effectiveDate" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketReferencePrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketReferencePrice_cropId_unitId_key" ON "MarketReferencePrice"("cropId", "unitId");
CREATE INDEX "MarketReferencePrice_cropId_idx" ON "MarketReferencePrice"("cropId");
CREATE INDEX "MarketReferencePrice_unitId_idx" ON "MarketReferencePrice"("unitId");
CREATE INDEX "MarketReferencePrice_effectiveDate_idx" ON "MarketReferencePrice"("effectiveDate");

ALTER TABLE "MarketReferencePrice" ADD CONSTRAINT "MarketReferencePrice_cropId_fkey"
  FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketReferencePrice" ADD CONSTRAINT "MarketReferencePrice_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
