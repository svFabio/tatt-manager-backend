-- AlterTable
ALTER TABLE "Cita" ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "origen" TEXT NOT NULL DEFAULT 'virtual';

-- CreateTable
CREATE TABLE "MensajeChat" (
    "id" SERIAL NOT NULL,
    "remoteJid" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensajeChat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MensajeChat_remoteJid_timestamp_idx" ON "MensajeChat"("remoteJid", "timestamp");
