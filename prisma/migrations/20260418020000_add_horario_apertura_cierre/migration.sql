-- AlterTable: add horaApertura and horaCierre to Configuracion
ALTER TABLE "Configuracion"
  ADD COLUMN "horaApertura" TEXT NOT NULL DEFAULT '09:00',
  ADD COLUMN "horaCierre"   TEXT NOT NULL DEFAULT '21:00';
