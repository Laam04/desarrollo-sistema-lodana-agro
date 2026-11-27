-- Conserva las referencias históricas y desvincúlalas de los catálogos activos.
ALTER TABLE "MarketReferencePrice"
  DROP CONSTRAINT "MarketReferencePrice_cropId_fkey",
  DROP CONSTRAINT "MarketReferencePrice_unitId_fkey";
