# Producción agrícola

## Activación

1. Copia `.env.example` a `.env` y configura `DATABASE_URL` y `DIRECT_URL`:
   - **Pruebas locales (base de datos estática):** inicia PostgreSQL 16 local con `pnpm run db:test:start`, aplica migraciones con `pnpm run db:migrate` y carga el conjunto estático de pruebas con `pnpm run db:seed` (o `pnpm run db:seed:reset` para reiniciarlo).
   - **Neon (PostgreSQL serverless):** asigna la cadena *pooled* (`-pooler...neon.tech?sslmode=require`) en `DATABASE_URL` y la cadena *direct* (sin `-pooler`) en `DIRECT_URL`, luego ejecuta `pnpm exec prisma generate` y `pnpm run db:migrate`.
2. Configura `LODANA_SESSION_SECRET` (secreto aleatorio de al menos 32 caracteres), `APP_ORIGIN` (origen canónico HTTPS para validación CSRF) y las credenciales `LODANA_PIN_PRODUCTION`, `LODANA_PIN_RECEPTION`, `LODANA_PIN_QUERIES` y `LODANA_PIN_ADMIN` (entre 4 y 64 caracteres).
3. Ejecuta `pnpm run build`. El acceso desplegado usa HTTPS, cookie `__Host-lodana-profile` de ocho horas revocable en base de datos y límite de diez intentos fallidos por perfil e IP durante una ventana de 15 minutos.

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
- Registra las cantidades que llegaron físicamente. Si queda saldo, puedes mantenerlo pendiente (`PARTIALLY_RECEIVED`) o cerrar el envío con `closesWithDifferences: true` (`RECEIVED_WITH_DIFFERENCES`). Si se reciben todas las cantidades, el envío pasa a `RECEIVED`. La primera recepción cierra la edición y la cancelación en Producción. Para un `409`, recarga el envío y vuelve a validar las cantidades.
- Producción reserva el inventario cuando registra el envío. Cada confirmación en Agro Market genera su propio recibo `REC-…`. La cantidad confirmada queda disponible para ventas en la unidad original.

## Registro de ventas

En **Agro Market → Ventas**, selecciona la fecha y el producto de un recibo. El buscador filtra los productos con saldo por nombre, número de recibo o código de envío. Ingresa la cantidad y el precio al cliente. Puedes registrar varias ventas del mismo producto a precios diferentes. Anular una venta devuelve su cantidad al saldo del recibo y deja una traza de auditoría.

La hoja conserva las columnas de la planilla de referencia y permite ver o exportar ventas por día o por semana. El resumen de Agro Market muestra el total vendido, las ventas registradas y la ganancia bruta estimada para la semana seleccionada, de lunes a domingo.

El precio al cliente que anotes en el recibo se sugiere al vender el producto. El porcentaje de ganancia se calcula sobre el precio de Producción como `(precio al cliente − precio de Producción) ÷ precio de Producción × 100`. La ganancia bruta estimada usa el precio de Producción como costo de referencia y cubre las ventas que tienen ese precio registrado.

## Resumen analítico y Consultas públicas

- **Resumen** agrupa los movimientos mensuales en PostgreSQL. Selecciona el período, el cultivo y la unidad. Los indicadores suman solo las cantidades de la unidad elegida. Las comparaciones porcentuales requieren cobertura mensual equivalente y períodos cerrados.
- La producción útil descuenta las mermas aplicables de cada cosecha de origen. El gráfico de mermas usa la fecha de registro de la pérdida. Los despachos, las recepciones y las ventas se agrupan por su propia fecha. Las recepciones usan la hora de Ecuador.
- La estacionalidad exige al menos dos años calendario completos y consistencia entre años. Para la previsión se requieren 24 meses cerrados consecutivos con registros por cultivo y unidad. El modelo pondera los mismos meses de los dos años anteriores y ajusta por la mediana de sus doce variaciones interanuales. Los rangos usan errores retrospectivos del mismo horizonte cuando hay al menos seis observaciones para estimarlos. El registro mensual permite evaluar continuidad y deja abierta la cobertura real de cada mes.
- **Consultas** se abre desde inicio sin PIN. `/api/public-analytics` publica meses cerrados y excluye celdas con menos de tres registros por indicador, cultivo y unidad. También reserva la producción útil cuando su diferencia con la cosechada revelaría una merma poco frecuente. Las comparaciones y previsiones públicas usan los valores publicados. Los motivos de pérdida detallados se consultan desde el Resumen interno.

## Panel administrativo y Centro de reportes automáticos

- **Administración (`/administracion`)** requiere perfil `admin`. Ofrece dashboard de supervisión, monitoreo de despachos pendientes/parciales/con diferencias, verificación automática de integridad de datos, gestión de perfiles y PINs (con hash `scrypt` persistente y revocación de sesiones), visor de auditoría de solo lectura y configuración institucional/de reportes.
- **Reportes (`/reportes`)** requiere perfil `queries` o `admin`. Permite generar vistas previas y reportes guardados (Producción agrícola, Costos de producción, Despachos y recepciones, Comercial de Agro Market, Consolidado de productividad y análisis de impacto, y Semanal operativo), consultar el historial diferenciando reportes automáticos y manuales, y descargar en **PDF institucional** o **CSV**.
- **Automatización**: usa `America/Guayaquil`, genera reportes semanales (lunes a domingo) y mensuales (meses calendario cerrados) evitando duplicados mediante `dedupeKey` y recuperando períodos pendientes tras apagados del servidor. Configurable mediante `LODANA_CRON_SECRET`, `GET/POST /api/cron/reports`, `vercel.json` o `npm run reports:auto`. Consulta `README.md` para detalles completos.
