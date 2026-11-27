-- Una conversión reutiliza una recepción existente sin sumar una nueva entrega física.
ALTER TABLE "ReceptionItem"
  DROP CONSTRAINT "ReceptionItem_quantity_check",
  ADD CONSTRAINT "ReceptionItem_quantity_check" CHECK (
    "receivedQuantity" > 0 OR ("receivedQuantity" = 0 AND "parentItemId" IS NOT NULL)
  );
