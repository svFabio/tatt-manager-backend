-- CreateTable
CREATE TABLE "Cita" (
    "id" SERIAL NOT NULL,
    "clienteNombre" TEXT,
    "clienteTelefono" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "horario" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL DEFAULT 50.0,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE_PAGO',
    "comprobanteUrl" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuracion" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "qrContenido" TEXT NOT NULL DEFAULT 'TU_CODIGO_QR_AQUI',
    "mensajeBienvenida" TEXT NOT NULL DEFAULT 'Hola, envía tu comprobante.',

    CONSTRAINT "Configuracion_pkey" PRIMARY KEY ("id")
);
