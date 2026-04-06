-- CreateTable
CREATE TABLE "SesionChat" (
    "id" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "ultimoMensaje" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SesionChat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SesionChat_ultimoMensaje_idx" ON "SesionChat"("ultimoMensaje");
