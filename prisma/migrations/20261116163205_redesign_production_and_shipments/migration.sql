/*
  Warnings:

  - You are about to drop the column `hasLots` on the `Crop` table. All the data in the column will be lost.
  - You are about to drop the column `lotId` on the `Harvest` table. All the data in the column will be lost.
  - You are about to drop the column `cropId` on the `Loss` table. All the data in the column will be lost.
  - You are about to drop the column `lotId` on the `Loss` table. All the data in the column will be lost.
  - You are about to drop the column `unitId` on the `Loss` table. All the data in the column will be lost.
  - You are about to drop the column `varietyId` on the `Loss` table. All the data in the column will be lost.
  - You are about to drop the column `cropId` on the `Shipment` table. All the data in the column will be lost.
  - You are about to drop the column `lotId` on the `Shipment` table. All the data in the column will be lost.
  - You are about to drop the column `marketQuantity` on the `Shipment` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `Shipment` table. All the data in the column will be lost.
  - You are about to drop the column `totalAmount` on the `Shipment` table. All the data in the column will be lost.
  - You are about to drop the column `unitId` on the `Shipment` table. All the data in the column will be lost.
  - You are about to drop the column `unitPrice` on the `Shipment` table. All the data in the column will be lost.
  - You are about to drop the column `varietyId` on the `Shipment` table. All the data in the column will be lost.
  - You are about to drop the `Lot` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Zone` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[code]` on the table `Shipment` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `harvestId` to the `Loss` table without a default value. This is not possible if the table is not empty.
  - Added the required column `code` to the `Shipment` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ProductionAreaType" AS ENUM ('LOT', 'ZONE');

-- DropForeignKey
ALTER TABLE "Harvest" DROP CONSTRAINT "Harvest_lotId_fkey";

-- DropForeignKey
ALTER TABLE "Loss" DROP CONSTRAINT "Loss_cropId_fkey";

-- DropForeignKey
ALTER TABLE "Loss" DROP CONSTRAINT "Loss_lotId_fkey";

-- DropForeignKey
ALTER TABLE "Loss" DROP CONSTRAINT "Loss_unitId_fkey";

-- DropForeignKey
ALTER TABLE "Loss" DROP CONSTRAINT "Loss_varietyId_fkey";

-- DropForeignKey
ALTER TABLE "Lot" DROP CONSTRAINT "Lot_cropId_fkey";

-- DropForeignKey
ALTER TABLE "Shipment" DROP CONSTRAINT "Shipment_cropId_fkey";

-- DropForeignKey
ALTER TABLE "Shipment" DROP CONSTRAINT "Shipment_lotId_fkey";

-- DropForeignKey
ALTER TABLE "Shipment" DROP CONSTRAINT "Shipment_unitId_fkey";

-- DropForeignKey
ALTER TABLE "Shipment" DROP CONSTRAINT "Shipment_varietyId_fkey";

-- DropForeignKey
ALTER TABLE "Zone" DROP CONSTRAINT "Zone_cropId_fkey";

-- DropIndex
DROP INDEX "Loss_date_cropId_idx";

-- DropIndex
DROP INDEX "Shipment_date_cropId_idx";

-- AlterTable
ALTER TABLE "Crop" DROP COLUMN "hasLots",
ADD COLUMN     "hasProductionAreas" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Harvest" DROP COLUMN "lotId",
ADD COLUMN     "estimatedUnitPrice" DECIMAL(12,2),
ADD COLUMN     "productionAreaId" TEXT;

-- AlterTable
ALTER TABLE "Loss" DROP COLUMN "cropId",
DROP COLUMN "lotId",
DROP COLUMN "unitId",
DROP COLUMN "varietyId",
ADD COLUMN     "harvestId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Shipment" DROP COLUMN "cropId",
DROP COLUMN "lotId",
DROP COLUMN "marketQuantity",
DROP COLUMN "quantity",
DROP COLUMN "totalAmount",
DROP COLUMN "unitId",
DROP COLUMN "unitPrice",
DROP COLUMN "varietyId",
ADD COLUMN     "code" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'IN_TRANSIT';

-- DropTable
DROP TABLE "Lot";

-- DropTable
DROP TABLE "Zone";

-- CreateTable
CREATE TABLE "ProductionArea" (
    "id" TEXT NOT NULL,
    "cropId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "type" "ProductionAreaType" NOT NULL DEFAULT 'LOT',
    "surface" DECIMAL(12,2),
    "surfaceUnit" TEXT DEFAULT 'ha',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentItem" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "cropId" TEXT NOT NULL,
    "varietyId" TEXT,
    "productionAreaId" TEXT,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unitId" TEXT NOT NULL,
    "estimatedUnitPrice" DECIMAL(12,2),
    "estimatedTotalAmount" DECIMAL(14,2),
    "notes" TEXT,

    CONSTRAINT "ShipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentAllocation" (
    "id" TEXT NOT NULL,
    "shipmentItemId" TEXT NOT NULL,
    "harvestId" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reception" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceptionItem" (
    "id" TEXT NOT NULL,
    "receptionId" TEXT NOT NULL,
    "shipmentItemId" TEXT NOT NULL,
    "receivedQuantity" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "ReceptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductionArea_cropId_active_idx" ON "ProductionArea"("cropId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionArea_cropId_normalizedName_key" ON "ProductionArea"("cropId", "normalizedName");

-- CreateIndex
CREATE INDEX "ShipmentItem_shipmentId_idx" ON "ShipmentItem"("shipmentId");

-- CreateIndex
CREATE INDEX "ShipmentItem_cropId_idx" ON "ShipmentItem"("cropId");

-- CreateIndex
CREATE INDEX "ShipmentAllocation_harvestId_idx" ON "ShipmentAllocation"("harvestId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentAllocation_shipmentItemId_harvestId_key" ON "ShipmentAllocation"("shipmentItemId", "harvestId");

-- CreateIndex
CREATE INDEX "Reception_shipmentId_receivedAt_idx" ON "Reception"("shipmentId", "receivedAt");

-- CreateIndex
CREATE INDEX "ReceptionItem_shipmentItemId_idx" ON "ReceptionItem"("shipmentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceptionItem_receptionId_shipmentItemId_key" ON "ReceptionItem"("receptionId", "shipmentItemId");

-- CreateIndex
CREATE INDEX "Harvest_createdAt_idx" ON "Harvest"("createdAt");

-- CreateIndex
CREATE INDEX "Loss_harvestId_date_idx" ON "Loss"("harvestId", "date");

-- CreateIndex
CREATE INDEX "Loss_status_idx" ON "Loss"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_code_key" ON "Shipment"("code");

-- CreateIndex
CREATE INDEX "Shipment_date_idx" ON "Shipment"("date");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- AddForeignKey
ALTER TABLE "ProductionArea" ADD CONSTRAINT "ProductionArea_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Harvest" ADD CONSTRAINT "Harvest_productionAreaId_fkey" FOREIGN KEY ("productionAreaId") REFERENCES "ProductionArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loss" ADD CONSTRAINT "Loss_harvestId_fkey" FOREIGN KEY ("harvestId") REFERENCES "Harvest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_varietyId_fkey" FOREIGN KEY ("varietyId") REFERENCES "Variety"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_productionAreaId_fkey" FOREIGN KEY ("productionAreaId") REFERENCES "ProductionArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentAllocation" ADD CONSTRAINT "ShipmentAllocation_shipmentItemId_fkey" FOREIGN KEY ("shipmentItemId") REFERENCES "ShipmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentAllocation" ADD CONSTRAINT "ShipmentAllocation_harvestId_fkey" FOREIGN KEY ("harvestId") REFERENCES "Harvest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reception" ADD CONSTRAINT "Reception_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceptionItem" ADD CONSTRAINT "ReceptionItem_receptionId_fkey" FOREIGN KEY ("receptionId") REFERENCES "Reception"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceptionItem" ADD CONSTRAINT "ReceptionItem_shipmentItemId_fkey" FOREIGN KEY ("shipmentItemId") REFERENCES "ShipmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
