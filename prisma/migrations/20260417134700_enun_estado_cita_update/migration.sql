/*
  Warnings:

  - The values [CONFIRMADA,COMPLETADA] on the enum `EstadoCita` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "EstadoCita_new" AS ENUM ('PENDIENTE', 'AGENDADO', 'CANCELADA', 'COMPLETADO', 'NO_ASISTIO');
ALTER TABLE "Cita" ALTER COLUMN "estado" DROP DEFAULT;
ALTER TABLE "Cita" ALTER COLUMN "estado" TYPE "EstadoCita_new" USING ("estado"::text::"EstadoCita_new");
ALTER TYPE "EstadoCita" RENAME TO "EstadoCita_old";
ALTER TYPE "EstadoCita_new" RENAME TO "EstadoCita";
DROP TYPE "EstadoCita_old";
ALTER TABLE "Cita" ALTER COLUMN "estado" SET DEFAULT 'PENDIENTE';
COMMIT;
