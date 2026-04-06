-- AlterTable
CREATE SEQUENCE configuracion_id_seq;
ALTER TABLE "Configuracion" ADD COLUMN     "horarios" JSONB NOT NULL DEFAULT '{"lunes":["09:00","10:00","11:00","12:00"],"martes":["09:00","10:00","11:00","12:00"],"miercoles":["09:00","10:00","11:00","12:00"],"jueves":["09:00","10:00","11:00","12:00"],"viernes":["09:00","10:00","11:00","12:00"],"sabado":[],"domingo":[]}',
ADD COLUMN     "mensajeConfirmacion" TEXT NOT NULL DEFAULT 'Comprobante recibido! Tu cita esta siendo revisada. Te confirmamos pronto.',
ADD COLUMN     "servicios" JSONB NOT NULL DEFAULT '[{"nombre":"Servicio","precio":0}]',
ADD COLUMN     "trigger" TEXT NOT NULL DEFAULT '!cita',
ALTER COLUMN "id" SET DEFAULT nextval('configuracion_id_seq'),
ALTER COLUMN "mensajeBienvenida" SET DEFAULT 'Hola! Soy el asistente de citas. Cual es tu nombre completo?';
ALTER SEQUENCE configuracion_id_seq OWNED BY "Configuracion"."id";
