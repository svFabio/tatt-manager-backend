/*
  Warnings:

  - The `estado` column on the `Cita` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "EstadoCita" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'COMPLETADA', 'NO_ASISTIO');

-- AlterTable
ALTER TABLE "Cita" DROP COLUMN "estado",
ADD COLUMN     "estado" "EstadoCita" NOT NULL DEFAULT 'PENDIENTE';
