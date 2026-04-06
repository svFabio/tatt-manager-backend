-- AlterTable
ALTER TABLE "Cita" ADD COLUMN     "comentario" TEXT,
ADD COLUMN     "encuestaEnviada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rating" INTEGER;
