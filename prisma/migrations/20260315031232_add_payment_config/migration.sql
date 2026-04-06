-- AlterTable
ALTER TABLE "Configuracion" ADD COLUMN     "cobrarAdelanto" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "porcentajeAdelanto" INTEGER NOT NULL DEFAULT 50;
