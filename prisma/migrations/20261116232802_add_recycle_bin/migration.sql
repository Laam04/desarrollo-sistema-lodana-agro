-- DropIndex
DROP INDEX "ProductionArea_cropId_active_idx";

-- AlterTable
ALTER TABLE "Cost" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CostAllocation" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CostCategory" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CostSubcategory" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Crop" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Harvest" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Loss" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LossReason" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProductionArea" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ALTER COLUMN "type" DROP DEFAULT,
ALTER COLUMN "surface" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "surfaceUnit" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Reception" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ReceptionItem" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ShipmentAllocation" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ShipmentItem" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Variety" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TrashEntry" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgeAt" TIMESTAMP(3) NOT NULL,
    "deletedBy" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredBy" TEXT,
    "snapshotJson" JSONB,

    CONSTRAINT "TrashEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrashEntry_groupId_idx" ON "TrashEntry"("groupId");

-- CreateIndex
CREATE INDEX "TrashEntry_entityType_entityId_idx" ON "TrashEntry"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "TrashEntry_purgeAt_restoredAt_idx" ON "TrashEntry"("purgeAt", "restoredAt");

-- CreateIndex
CREATE INDEX "TrashEntry_deletedAt_idx" ON "TrashEntry"("deletedAt");
