-- Migration: saas_multitenancy
-- Preserves all existing data by assigning it to a default Negocio (id=1)

-- 1. Create Plan enum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO');

-- 2. Create Negocio table
CREATE TABLE "Negocio" (
    "id"       SERIAL PRIMARY KEY,
    "googleId" TEXT NOT NULL,
    "email"    TEXT NOT NULL,
    "nombre"   TEXT NOT NULL DEFAULT 'Mi Negocio',
    "plan"     "Plan" NOT NULL DEFAULT 'FREE',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Negocio_googleId_key" UNIQUE ("googleId"),
    CONSTRAINT "Negocio_email_key" UNIQUE ("email")
);

-- 3. Insert default Negocio (id=1) to receive all existing data
--    googleId placeholder so existing rows don't break the unique constraint
INSERT INTO "Negocio" ("googleId", "email", "nombre", "plan")
VALUES ('legacy-spa-samsara', 'spa@samsara.com', 'Samsara Spa', 'FREE');

-- 4. Add googleId column to Usuario (nullable)
ALTER TABLE "Usuario" ADD COLUMN "googleId" TEXT;

-- 5. Add negocioId to tables WITH existing data — nullable first, backfill, then NOT NULL

-- Usuario
ALTER TABLE "Usuario" ADD COLUMN "negocioId" INTEGER;
UPDATE "Usuario" SET "negocioId" = 1;
ALTER TABLE "Usuario" ALTER COLUMN "negocioId" SET NOT NULL;
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_negocioId_fkey"
    FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cita
ALTER TABLE "Cita" ADD COLUMN "negocioId" INTEGER;
UPDATE "Cita" SET "negocioId" = 1;
ALTER TABLE "Cita" ALTER COLUMN "negocioId" SET NOT NULL;
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_negocioId_fkey"
    FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Cita_negocioId_fecha_idx" ON "Cita"("negocioId", "fecha");

-- SesionChat
ALTER TABLE "SesionChat" ADD COLUMN "negocioId" INTEGER;
UPDATE "SesionChat" SET "negocioId" = 1;
ALTER TABLE "SesionChat" ALTER COLUMN "negocioId" SET NOT NULL;
ALTER TABLE "SesionChat" ADD CONSTRAINT "SesionChat_negocioId_fkey"
    FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX IF EXISTS "SesionChat_ultimoMensaje_idx";
CREATE INDEX "SesionChat_negocioId_ultimoMensaje_idx" ON "SesionChat"("negocioId", "ultimoMensaje");

-- MensajeChat
ALTER TABLE "MensajeChat" ADD COLUMN "negocioId" INTEGER;
UPDATE "MensajeChat" SET "negocioId" = 1;
ALTER TABLE "MensajeChat" ALTER COLUMN "negocioId" SET NOT NULL;
ALTER TABLE "MensajeChat" ADD CONSTRAINT "MensajeChat_negocioId_fkey"
    FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX IF EXISTS "MensajeChat_remoteJid_timestamp_idx";
CREATE INDEX "MensajeChat_negocioId_remoteJid_timestamp_idx" ON "MensajeChat"("negocioId", "remoteJid", "timestamp");

-- 6. Configuracion: add negocioId nullable, backfill, then unique NOT NULL
ALTER TABLE "Configuracion" ADD COLUMN "negocioId" INTEGER;
UPDATE "Configuracion" SET "negocioId" = 1 WHERE "id" = 1;
ALTER TABLE "Configuracion" ALTER COLUMN "negocioId" SET NOT NULL;
ALTER TABLE "Configuracion" ADD CONSTRAINT "Configuracion_negocioId_key" UNIQUE ("negocioId");
ALTER TABLE "Configuracion" ADD CONSTRAINT "Configuracion_negocioId_fkey"
    FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. Also ensure password column exists (for backward compat with seed)
ALTER TABLE "Usuario" ALTER COLUMN "password" SET DEFAULT '';
