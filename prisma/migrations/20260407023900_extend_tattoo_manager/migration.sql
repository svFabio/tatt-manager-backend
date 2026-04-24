-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('PENDIENTE', 'COTIZADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "EstadoCita" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'FINALIZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('ENTRADA', 'DESCUENTO_SESION', 'AJUSTE_MANUAL');

-- CreateEnum
CREATE TYPE "TamanioCap" AS ENUM ('CHICA', 'MEDIANA', 'GRANDE');

-- AlterEnum: Add ARTISTA to Rol
ALTER TYPE "Rol" ADD VALUE 'ARTISTA';

-- AlterTable: Cita — rename old "estado" to keep data, add new columns
-- Step 1: Make legacy fields optional (they were NOT NULL before)
ALTER TABLE "Cita" ALTER COLUMN "fecha" DROP NOT NULL;
ALTER TABLE "Cita" ALTER COLUMN "horario" DROP NOT NULL;
ALTER TABLE "Cita" ALTER COLUMN "clienteTelefono" DROP NOT NULL;
ALTER TABLE "Cita" ALTER COLUMN "servicio" DROP NOT NULL;
ALTER TABLE "Cita" ALTER COLUMN "monto" DROP NOT NULL;

-- Step 2: Add new tattoo management columns to Cita
ALTER TABLE "Cita" ADD COLUMN "fechaHoraInicio" TIMESTAMP(3);
ALTER TABLE "Cita" ADD COLUMN "fechaHoraFin" TIMESTAMP(3);
ALTER TABLE "Cita" ADD COLUMN "duracionEnHoras" DECIMAL(4,1);
ALTER TABLE "Cita" ADD COLUMN "tipoCita" TEXT NOT NULL DEFAULT 'tatuaje';
ALTER TABLE "Cita" ADD COLUMN "estadoCita" "EstadoCita" NOT NULL DEFAULT 'PENDIENTE';
ALTER TABLE "Cita" ADD COLUMN "estiloDeTatuaje" TEXT;
ALTER TABLE "Cita" ADD COLUMN "zonaDelCuerpo" TEXT;
ALTER TABLE "Cita" ADD COLUMN "seniaPagada" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Cita" ADD COLUMN "clienteId" INTEGER;
ALTER TABLE "Cita" ADD COLUMN "artistaId" INTEGER;
ALTER TABLE "Cita" ADD COLUMN "solicitudId" INTEGER;

-- CreateTable: Cliente
CREATE TABLE "Cliente" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "numeroWhatsapp" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "negocioId" INTEGER NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Solicitud
CREATE TABLE "Solicitud" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'PENDIENTE',
    "zonaDelCuerpo" TEXT,
    "tamanoEnCm" TEXT,
    "descripcion" TEXT NOT NULL,
    "fotoReferenciaUrl" TEXT,
    "precioCotizado" DECIMAL(10,2),
    "horasEstimadas" DECIMAL(4,1),
    "seniaRequerida" DECIMAL(10,2),
    "recibidaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cotizadaEn" TIMESTAMP(3),
    "negocioId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "artistaId" INTEGER,

    CONSTRAINT "Solicitud_pkey" PRIMARY KEY ("id")
);

-- CreateTable: RegistroSesion
CREATE TABLE "RegistroSesion" (
    "id" SERIAL NOT NULL,
    "duracionEnHoras" DECIMAL(4,1) NOT NULL,
    "seniaRecibida" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cobroDelTrabajo" DECIMAL(10,2) NOT NULL,
    "totalDeLaSesion" DECIMAL(10,2) NOT NULL,
    "fotoResultadoUrl" TEXT,
    "observaciones" TEXT,
    "reportada" BOOLEAN NOT NULL DEFAULT false,
    "motivoReporte" TEXT,
    "cerradaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "negocioId" INTEGER NOT NULL,
    "citaId" INTEGER NOT NULL,
    "artistaId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,

    CONSTRAINT "RegistroSesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CapsUsadas
CREATE TABLE "CapsUsadas" (
    "id" SERIAL NOT NULL,
    "tamanioCap" "TamanioCap" NOT NULL,
    "cantidadUsada" INTEGER NOT NULL,
    "registroSesionId" INTEGER NOT NULL,
    "tintaId" INTEGER NOT NULL,

    CONSTRAINT "CapsUsadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Tinta
CREATE TABLE "Tinta" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "colorHex" CHAR(7) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "negocioId" INTEGER NOT NULL,

    CONSTRAINT "Tinta_pkey" PRIMARY KEY ("id")
);

-- CreateTable: StockTinta
CREATE TABLE "StockTinta" (
    "id" SERIAL NOT NULL,
    "tamanioCap" "TamanioCap" NOT NULL,
    "cantidadActual" INTEGER NOT NULL DEFAULT 0,
    "cantidadMinima" INTEGER NOT NULL DEFAULT 3,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tintaId" INTEGER NOT NULL,

    CONSTRAINT "StockTinta_pkey" PRIMARY KEY ("id")
);

-- CreateTable: HistorialInventario
CREATE TABLE "HistorialInventario" (
    "id" SERIAL NOT NULL,
    "tipoMovimiento" "TipoMovimiento" NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "motivo" TEXT,
    "registradoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stockTintaId" INTEGER NOT NULL,
    "registradoPorId" INTEGER NOT NULL,
    "registroSesionId" INTEGER,

    CONSTRAINT "HistorialInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Pago
CREATE TABLE "Pago" (
    "id" SERIAL NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "fotoComprobanteUrl" TEXT,
    "registradoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "negocioId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "citaId" INTEGER,
    "registradoPorId" INTEGER NOT NULL,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- AlterTable: MensajeChat — add optional foreign keys
ALTER TABLE "MensajeChat" ADD COLUMN "clienteId" INTEGER;
ALTER TABLE "MensajeChat" ADD COLUMN "solicitudId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_numeroWhatsapp_key" ON "Cliente"("numeroWhatsapp");
CREATE INDEX "Solicitud_negocioId_estado_recibidaEn_idx" ON "Solicitud"("negocioId", "estado", "recibidaEn");
CREATE UNIQUE INDEX "RegistroSesion_citaId_key" ON "RegistroSesion"("citaId");
CREATE INDEX "RegistroSesion_negocioId_cerradaEn_idx" ON "RegistroSesion"("negocioId", "cerradaEn");
CREATE UNIQUE INDEX "CapsUsadas_registroSesionId_tintaId_tamanioCap_key" ON "CapsUsadas"("registroSesionId", "tintaId", "tamanioCap");
CREATE UNIQUE INDEX "StockTinta_tintaId_tamanioCap_key" ON "StockTinta"("tintaId", "tamanioCap");
CREATE UNIQUE INDEX "Cita_solicitudId_key" ON "Cita"("solicitudId");
CREATE INDEX "Cita_negocioId_fechaHoraInicio_idx" ON "Cita"("negocioId", "fechaHoraInicio");

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_artistaId_fkey" FOREIGN KEY ("artistaId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "Solicitud"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_artistaId_fkey" FOREIGN KEY ("artistaId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RegistroSesion" ADD CONSTRAINT "RegistroSesion_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegistroSesion" ADD CONSTRAINT "RegistroSesion_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "Cita"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegistroSesion" ADD CONSTRAINT "RegistroSesion_artistaId_fkey" FOREIGN KEY ("artistaId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegistroSesion" ADD CONSTRAINT "RegistroSesion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CapsUsadas" ADD CONSTRAINT "CapsUsadas_registroSesionId_fkey" FOREIGN KEY ("registroSesionId") REFERENCES "RegistroSesion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CapsUsadas" ADD CONSTRAINT "CapsUsadas_tintaId_fkey" FOREIGN KEY ("tintaId") REFERENCES "Tinta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Tinta" ADD CONSTRAINT "Tinta_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTinta" ADD CONSTRAINT "StockTinta_tintaId_fkey" FOREIGN KEY ("tintaId") REFERENCES "Tinta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HistorialInventario" ADD CONSTRAINT "HistorialInventario_stockTintaId_fkey" FOREIGN KEY ("stockTintaId") REFERENCES "StockTinta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HistorialInventario" ADD CONSTRAINT "HistorialInventario_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HistorialInventario" ADD CONSTRAINT "HistorialInventario_registroSesionId_fkey" FOREIGN KEY ("registroSesionId") REFERENCES "RegistroSesion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "Cita"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MensajeChat" ADD CONSTRAINT "MensajeChat_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MensajeChat" ADD CONSTRAINT "MensajeChat_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "Solicitud"("id") ON DELETE SET NULL ON UPDATE CASCADE;
