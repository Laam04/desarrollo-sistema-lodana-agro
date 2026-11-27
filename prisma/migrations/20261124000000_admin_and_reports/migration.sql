-- Admin panel & automated reporting tables (additive, non-destructive)

-- 1. Persistent access configuration per profile (keeps compatibility with env PINs)
CREATE TABLE "ProfileAccessConfig" (
  "profile" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "pinHash" TEXT,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT,
  CONSTRAINT "ProfileAccessConfig_pkey" PRIMARY KEY ("profile")
);

-- 2. Persistent institutional and reporting configuration
CREATE TABLE "SystemSetting" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT,
  CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- 3. Persistent generated reports (manual & automatic, deduplicated via dedupeKey)
CREATE TABLE "GeneratedReport" (
  "id" TEXT NOT NULL,
  "dedupeKey" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "cadence" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'READY',
  "periodFrom" TEXT NOT NULL,
  "periodTo" TEXT NOT NULL,
  "periodLabel" TEXT NOT NULL,
  "filtersJson" JSONB,
  "summaryJson" JSONB,
  "payloadJson" JSONB,
  "errorMessage" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "generatedBy" TEXT NOT NULL,
  "generatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GeneratedReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GeneratedReport_attempts_check" CHECK ("attempts" >= 1)
);

CREATE UNIQUE INDEX "GeneratedReport_dedupeKey_key" ON "GeneratedReport"("dedupeKey");
CREATE INDEX "GeneratedReport_type_generatedAt_idx" ON "GeneratedReport"("type", "generatedAt");
CREATE INDEX "GeneratedReport_trigger_cadence_periodFrom_periodTo_idx" ON "GeneratedReport"("trigger", "cadence", "periodFrom", "periodTo");
CREATE INDEX "GeneratedReport_status_generatedAt_idx" ON "GeneratedReport"("status", "generatedAt");
CREATE INDEX "GeneratedReport_generatedAt_idx" ON "GeneratedReport"("generatedAt");

-- 4. Report automation execution log
CREATE TABLE "ReportAutomationRun" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "checkedPeriods" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "detailsJson" JSONB,
  "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMPTZ(3),
  CONSTRAINT "ReportAutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportAutomationRun_startedAt_idx" ON "ReportAutomationRun"("startedAt");

-- 5. AuditLog lookup indexes for admin filtering
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_actor_createdAt_idx" ON "AuditLog"("actor", "createdAt");
