-- AlterTable
ALTER TABLE "Cita" ADD COLUMN     "recordatorio1h" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recordatorio24h" BOOLEAN NOT NULL DEFAULT false;
