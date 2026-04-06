-- DropIndex
DROP INDEX "Cita_clienteTelefono_estado_idx";

-- DropIndex
DROP INDEX "Cita_fecha_estado_idx";

-- DropIndex
DROP INDEX "Cita_fecha_horario_idx";

-- AlterTable
ALTER TABLE "Cita" ADD COLUMN     "servicio" TEXT NOT NULL DEFAULT 'Spa',
ALTER COLUMN "fecha" DROP DEFAULT,
ALTER COLUMN "monto" DROP DEFAULT,
ALTER COLUMN "estado" SET DEFAULT 'PENDIENTE';
