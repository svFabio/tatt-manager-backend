-- AlterTable: add tattoo detail and cotizacion fields to Cita
ALTER TABLE "Cita"
  ADD COLUMN "referenciaUrl"     TEXT,
  ADD COLUMN "zona"              TEXT,
  ADD COLUMN "tamano"            TEXT,
  ADD COLUMN "esColor"           BOOLEAN,
  ADD COLUMN "tiempoEstimado"    TEXT,
  ADD COLUMN "cotizacion"        DOUBLE PRECISION,
  ADD COLUMN "cotizacionEnviada" BOOLEAN NOT NULL DEFAULT false;
