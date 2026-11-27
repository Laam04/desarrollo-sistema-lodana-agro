# Lodana Agro

**Construcción del sistema de reportes automáticos de productividad y análisis de impacto para el agricultor.**

Sistema web desarrollado como proyecto de titulación de la carrera de Ingeniería en Software de la **Universidad Laica Eloy Alfaro de Manabí (ULEAM)** para digitalizar los procesos de producción agrícola de la **Finca Experimental Lodana** y su comercialización en **Agro Market**, garantizando trazabilidad desde la cosecha hasta la venta final y generando reportes periódicos automáticos e indicadores descriptivos para la toma de decisiones.

## Arquitectura y módulos

- **Stack principal**: Next.js 16 (App Router + Turbopack), React 19, TypeScript, PostgreSQL 16, Prisma ORM 6, Tailwind CSS 4, shadcn/ui + Base UI, Lucide Icons y SWR.
- **Autenticación y autorización**: Acceso por perfiles (`production`, `reception`, `queries`, `admin`) mediante PIN verificado en servidor, cookies firmadas con HMAC-SHA256 (`__Host-lodana-profile` en producción), sesiones revocables en PostgreSQL (`ProfileSession`), límite de intentos por cliente (`ProfileLoginAttempt`), y gestión persistente de habilitación y credenciales con hash `scrypt` (`ProfileAccessConfig`).
- **Espacios de trabajo**:
  - **Producción agrícola (`/lodana`)**: cultivos, variedades, zonas compartidas, áreas, unidades, cosechas, mermas, costos, despachos hacia Agro Market, disponibilidad, papelera recuperable (60 días) y resumen analítico interno.
  - **Agro Market (`/agro-market`)**: recepciones totales/parciales/con diferencias, historial de recibos, existencias, ventas, anulación con devolución de saldo, exportación CSV y resumen comercial semanal.
  - **Consultas públicas (`/consultas`)**: acceso sin PIN a series mensuales cerradas con umbral de privacidad (`≥ 3` registros por celda).
  - **Panel administrativo (`/administracion`)**: dashboard de supervisión, supervisión operativa y verificaciones de integridad, gestión de accesos y perfiles, auditoría inmutable filtrable y configuración general.
  - **Centro de reportes automáticos (`/reportes`)**: generación manual con vista previa, 6 tipos de informes estructurados, historial con distinción automático/manual, análisis determinista descriptivo, exportación institucional a **PDF** (vectorial multipágina sin dependencias pesadas) y **CSV**, y automatización periódica con recuperación de períodos pendientes.

## Instalación y puesta en marcha local

1. **Variables de entorno**: copia `.env.example` a `.env` y configura:
   - `DATABASE_URL` y `DIRECT_URL` (PostgreSQL 16 local en puerto `5433` o Neon serverless).
   - `LODANA_SESSION_SECRET` (mínimo 32 caracteres aleatorios).
   - `APP_ORIGIN` (`http://localhost:3000` en local; origen HTTPS canónico en producción).
   - `LODANA_PIN_PRODUCTION`, `LODANA_PIN_RECEPTION`, `LODANA_PIN_QUERIES`, `LODANA_PIN_ADMIN` (exactamente 4 caracteres).
   - `CRON_SECRET` (secreto Bearer mínimo 32 caracteres para `/api/cron/reports`). El nombre anterior `LODANA_CRON_SECRET` sigue disponible para instalaciones existentes.
2. **Base de datos local de pruebas**:
   ```bash
   npm run db:test:start
   npm run db:migrate
   npm run db:seed
   ```
3. **Ejecución en desarrollo**:
   ```bash
   npm run dev
   ```
   Disponible en `http://localhost:3000`.

## Nuevos modelos de datos (migración `20261124000000_admin_and_reports`)

Antes de actualizar una instalación existente, cambia en **Administración → Accesos** los PIN de más de 4 caracteres guardados en la base de datos. Ajusta también cualquier PIN de entorno más largo. Los PIN existentes de cuatro caracteres se pueden seguir usando.

La migración `20261127130000_archive_market_reference_prices` conserva las referencias históricas de precios y las desvincula de los catálogos activos.

- `ProfileAccessConfig`: estado de habilitación y hash `scrypt` opcional del PIN por perfil (mantiene compatibilidad con los PINs de entorno cuando `pinHash` es `null`). Nunca se permite deshabilitar `admin`.
- `SystemSetting`: configuración persistente tipada (`institution` para encabezados institucionales y `reporting` para periodicidad y ventanas de recuperación).
- `GeneratedReport`: almacenamiento persistente y reproducible de informes (`payloadJson`, `summaryJson`, `filtersJson`, `trigger`, `cadence`, `status`, `attempts`, `errorMessage`) con clave única `dedupeKey` para evitar duplicados en reportes automáticos.
- `ReportAutomationRun`: bitácora de ejecuciones automáticas (origen, períodos evaluados, creados, omitidos y fallidos).

## Endpoints de Administración y Reportes

### Administración (requieren perfil `admin`)
| Método y ruta | Descripción |
| --- | --- |
| `GET /api/admin/overview` | Indicadores de supervisión, estado de módulos, actividad reciente y pendientes de automatización. |
| `GET /api/admin/access` | Estado de perfiles, permisos, sesiones activas, bloqueos y eventos de seguridad (nunca expone PIN ni hashes). |
| `PATCH /api/admin/access` | Acciones: `toggle_enabled`, `update_pin`, `reset_pin`, `revoke_sessions`, `clear_lockouts`. Todo se registra en `AuditLog`. |
| `GET /api/admin/audit` | Consulta paginada, filtrable y de solo lectura sobre `AuditLog`. |
| `GET /api/admin/operations` | Despachos pendientes/parciales/con diferencias, cancelaciones, papelera y 6 verificaciones automáticas de integridad. |
| `GET / PATCH /api/admin/settings` | Lectura y actualización auditada de `institution` y `reporting`. |

### Reportes y automatización
| Método y ruta | Acceso | Descripción |
| --- | --- | --- |
| `GET /api/reports` | `queries`, `admin` | Historial paginado/filtrable de reportes, catálogos y estado de períodos pendientes. |
| `POST /api/reports` | `queries`, `admin` | Genera vista previa (`save: false`) o guarda un reporte manual (`save: true`). |
| `GET /api/reports/[id]` | `queries`, `admin` | Devuelve el detalle estructurado completo de un reporte almacenado. |
| `POST /api/reports/[id]` | `admin` | Reintenta la generación de un reporte en estado `FAILED`. |
| `GET /api/reports/[id]/export?format=pdf\|csv` | `queries`, `admin` | Descarga en PDF institucional o CSV UTF-8 protegido contra inyección de fórmulas. |
| `POST /api/reports/export` | `queries`, `admin` | Exporta directamente a PDF o CSV desde parámetros de vista previa. |
| `POST /api/reports/automation` | `admin` | Ejecuta recuperación de períodos pendientes o un cierre específico (`targetMonth` o `targetWeekDay`). |
| `GET / POST /api/cron/reports` | `Bearer CRON_SECRET` | Endpoint externo idempotente para cron jobs. Admite `?asOf=AAAA-MM-DD`, `?targetMonth=AAAA-MM` y `?targetWeekDay=AAAA-MM-DD`. |

## Configuración de reportes automáticos

Los reportes automáticos operan en la zona horaria **`America/Guayaquil`**:
- **Semanal operativo (`WEEKLY_OPERATIONAL`)**: períodos cerrados de lunes a domingo.
- **Mensual consolidado (`CONSOLIDATED_IMPACT`)**: meses calendario cerrados.
- **Recuperación tras apagado**: cada ejecución evalúa las últimas `maxBackfillWeeks` semanas cerradas y `maxBackfillMonths` meses cerrados configurados en Administración → Configuración, generando solo los faltantes o reintentando los fallidos, sin crear duplicados gracias a `dedupeKey`.
- Los reportes generados están disponibles en **Reportes → Historial**. Cada PDF presenta las tablas del informe seleccionado como una planilla A4 horizontal con encabezados repetidos y columnas numéricas alineadas. El CSV se puede abrir en Excel.

### Ejecución local (Windows Task Scheduler o cron)
```bash
npm run reports:auto
```
En Windows Task Scheduler, crea una tarea diaria (ej. `00:15` hora Ecuador) ejecutando `node scripts/run-report-automation.mjs` en el directorio del proyecto.

### Pruebas inmediatas sin esperar al cierre de semana o mes
```bash
# Simular una fecha de ejecución específica
node scripts/run-report-automation.mjs --as-of=2026-12-01

# Forzar el cierre automático de un mes calendario específico
node scripts/run-report-automation.mjs --month=2026-10

# Forzar el cierre automático de una semana (lunes a domingo que contiene la fecha)
node scripts/run-report-automation.mjs --week=2026-11-16
```
También puedes ejecutar estos cierres desde **Reportes → Automatización** con perfil `admin`.

### Producción (Vercel / cron externo)
El repositorio incluye `vercel.json` configurado para invocar `/api/cron/reports` diariamente a las `05:15 UTC` (`00:15` Ecuador). Configura `CRON_SECRET` en las variables de entorno de producción de Vercel para que el programador lo envíe automáticamente. Si usas otro programador, envía `Authorization: Bearer <CRON_SECRET>`.

## Verificación y pruebas

```bash
npm run test       # Pruebas unitarias (modelo analítico, auditoría, seguridad PIN, períodos, reglas deterministas, PDF/CSV)
npm run typecheck  # Verificación de tipos TypeScript
npm run build      # Compilación de producción Next.js
```

## Limitaciones conocidas

- Los gráficos incrustados en PDF utilizan trazado vectorial nativo liviano (líneas y barras agrupadas) optimizado para legibilidad en impresión A4; no renderizan capas interactivas del navegador.
- El análisis de impacto es estrictamente descriptivo y determinista; no realiza inferencia causal ni sustituye una evaluación agronómica de campo.
- El cálculo de costo directo por unidad útil excluye los gastos generales no asignados y se omite cuando un mismo cultivo se registra en múltiples unidades incompatibles dentro del período.
- Para la consulta detallada de reglas de producción y Agro Market, consulta [PRODUCCION_AGRICOLA.md](PRODUCCION_AGRICOLA.md).
