ALTER TABLE "Reception" ADD COLUMN "receiptNumber" SERIAL NOT NULL;
CREATE UNIQUE INDEX "Reception_receiptNumber_key" ON "Reception"("receiptNumber");

CREATE TYPE "MarketPayment" AS ENUM ('CASH', 'TRANSFER');

CREATE TABLE "MarketSale" (
    "id" TEXT NOT NULL,
    "receptionItemId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "payment" "MarketPayment" NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    CONSTRAINT "MarketSale_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MarketSale_receptionItemId_fkey" FOREIGN KEY ("receptionItemId") REFERENCES "ReceptionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MarketSale_amount_check" CHECK ("quantity" > 0 AND "unitPrice" > 0 AND "total" = ROUND("quantity" * "unitPrice", 2))
);

CREATE INDEX "MarketSale_date_cancelledAt_idx" ON "MarketSale"("date", "cancelledAt");
CREATE INDEX "MarketSale_receptionItemId_cancelledAt_idx" ON "MarketSale"("receptionItemId", "cancelledAt");
