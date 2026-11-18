# Producción agrícola

## Activación

1. Genera el cliente con `npx prisma generate` y aplica las migraciones con `npx prisma migrate deploy` en la base correspondiente.
2. Configura `DATABASE_URL`, `LODANA_SESSION_SECRET` y `LODANA_PIN_PRODUCTION` en el entorno de despliegue. La sesión requiere un secreto aleatorio de al menos 32 caracteres y los perfiles requieren un PIN de cuatro dígitos. Configura `LODANA_PIN_RECEPTION`, `LODANA_PIN_QUERIES` y `LODANA_PIN_ADMIN` para habilitar sus accesos.
3. Ejecuta `npm run build`. El acceso desplegado usa HTTPS y una cookie de sesión de ocho horas. Diez PIN incorrectos bloquean temporalmente el perfil durante su ventana de 15 minutos.

La auditoría de envíos y recepciones identifica el perfil con el que se realizó la operación. Los historiales conservan las referencias a unidades, cultivos, variedades y áreas. Al desactivar un cultivo, sus cosechas siguen en el historial y sus existencias salen del catálogo de despacho hasta que se reactive. La papelera permite restaurar registros durante 60 días.

## Recepciones de Agro Market

La sesión de `reception` o `admin` autoriza `/agro-market`, `/api/receptions` y `/api/market-sales`.

| Operación | Solicitud |
| --- | --- |
| Listar envíos pendientes | `GET /api/receptions?page=1`. Devuelve `{ rows, hasNext }`. Admite `q` para buscar por código y `from` y `to` como fechas inclusivas en formato `AAAA-MM-DD`. |
| Consultar recepciones anteriores | `GET /api/receptions?view=history&page=1`. Devuelve los envíos con al menos un recibo registrado. |
| Consultar un envío | `GET /api/receptions?shipmentId=...`. Cada línea identifica el cultivo, la variedad, el área y la unidad, e incluye `quantity`, `receivedQuantity` y `pendingQuantity` como cadenas decimales. |
| Registrar una recepción | `POST /api/receptions`. Devuelve `{ reception, shipment }` con el saldo y el estado actualizados. |

Cuerpo de una recepción:

```json
{
  "requestId": "63a5367d-42f0-4213-ade2-a9b526458816",
  "shipmentId": "<id del envío>",
  "notes": "Entrega de la mañana",
  "items": [
    { "shipmentItemId": "<id de la línea del envío>", "receivedQuantity": "12.50" }
  ]
}
```

- Usa `crypto.randomUUID()` una vez al confirmar la recepción y reutiliza el UUID y el mismo cuerpo al reintentar. La respuesta es `201` al crear la recepción y `200` al repetir la solicitud guardada.
- Envía cada línea recibida una sola vez y usa cantidades positivas de hasta dos decimales, en la unidad original del envío. Omite las líneas sin entrega. Las observaciones son opcionales por recepción y por línea.
- Un envío pasa de `IN_TRANSIT` a `PARTIALLY_RECEIVED` si queda saldo y a `RECEIVED` cuando se completan sus líneas. La primera recepción cierra la edición y la cancelación en Producción. Para un `409`, recarga el envío y vuelve a validar las cantidades.
- Producción reserva el inventario cuando registra el envío. Cada confirmación en Agro Market genera su propio recibo `REC-…`. La cantidad confirmada queda disponible para ventas en la unidad original.

## Registro diario de ventas

En **Agro Market → Ventas**, selecciona la fecha y el producto de un recibo. Registra la cantidad, el precio unitario y la forma de pago. Puedes registrar varias ventas del mismo producto a precios diferentes. Las ventas de cada línea se acumulan hasta el saldo confirmado en su recibo. Anular una venta devuelve su cantidad al saldo y deja una traza de auditoría.

La hoja diaria conserva el orden de la planilla de referencia. Muestra la fecha, el número de recibo, el proveedor, el producto, la cantidad, la unidad, el precio unitario y el valor total. También conserva la forma de pago para el cierre de efectivo y transferencias. El CSV exporta toda la fecha seleccionada y añade el código del envío para conciliación.

Los recibos de este flujo se generan a partir de los envíos de Finca Lodana. El precio estimado de Producción se muestra como referencia en la recepción. El precio que registra el equipo en cada venta determina el importe del cierre diario.
