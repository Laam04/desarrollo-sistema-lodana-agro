CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Zone_normalizedName_key" ON "Zone"("normalizedName");

ALTER TABLE "ProductionArea" ADD COLUMN "zoneId" TEXT;
INSERT INTO "Zone" ("id", "name", "normalizedName")
SELECT DISTINCT ON ("normalizedName") 'zone-' || "id", "name", "normalizedName"
FROM "ProductionArea"
ORDER BY "normalizedName", ("deletedAt" IS NULL AND active) DESC, "createdAt", "id";
UPDATE "ProductionArea" a SET "zoneId" = z.id
FROM "Zone" z WHERE z."normalizedName" = a."normalizedName";
CREATE INDEX "ProductionArea_zoneId_idx" ON "ProductionArea"("zoneId");
ALTER TABLE "ProductionArea" ADD CONSTRAINT "ProductionArea_zoneId_fkey"
FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Reception" ADD COLUMN "closesWithDifferences" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReceptionItem" ADD COLUMN "customerUnitPrice" DECIMAL(12,2);
ALTER TABLE "ReceptionItem" ADD CONSTRAINT "ReceptionItem_customer_price_check" CHECK ("customerUnitPrice" > 0);
ALTER TABLE "MarketSale" ALTER COLUMN "payment" DROP NOT NULL;
