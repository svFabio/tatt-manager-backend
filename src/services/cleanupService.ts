import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { enviarMensaje } from './whatsappClient';

export const iniciarCronJobs = () => {
    console.log('[Cron] 🕒 Iniciando planificador de tareas...');

    // ─── Job 1: Limpiar sesiones de chat inactivas (cada 5 min) ──────────────
    cron.schedule('*/5 * * * *', async () => {
        console.log('[Cron] 🧹 Ejecutando limpieza de sesiones expiradas...');
        try {
            const limiteTiempo = new Date(Date.now() - 30 * 60 * 1000);
            const resultado = await prisma.sesionChat.deleteMany({
                where: {
                    ultimoMensaje: { lt: limiteTiempo }
                }
            });
            if (resultado.count > 0) {
                console.log(`[Cron] ✅ Se eliminaron ${resultado.count} sesiones inactivas.`);
            }
        } catch (error) {
            console.error('[Cron] ❌ Error en limpieza de sesiones:', error);
        }
    });

    // ─── Job 2: Cancelar citas cuyo anticipo no fue enviado en 1 hora ─────────
    cron.schedule('*/5 * * * *', async () => {
        console.log('[Cron] ⏰ Verificando pagos pendientes expirados...');
        try {
            const pagosExpirados = await prisma.pago.findMany({
                where: {
                    estadoValidacion: 'PENDIENTE_VALIDACION',
                    fotoComprobanteUrl: null,          // aún no ha enviado comprobante
                    expiradoEn: { lt: new Date() },    // ya venció la hora de espera
                    citaId: { not: null },
                },
                include: {
                    cliente: { select: { id: true, nombre: true, numeroWhatsapp: true } },
                    cita: true,
                },
            });

            for (const pago of pagosExpirados) {
                console.log(`[Cron] 🚫 Liberando cita ${pago.citaId} por pago expirado (cliente: ${pago.cliente?.nombre})`);

                // Cancelar la cita
                await prisma.cita.update({
                    where: { id: pago.citaId! },
                    data: { estadoCita: 'CANCELADA' },
                });

                // Marcar el pago como rechazado
                await prisma.pago.update({
                    where: { id: pago.id },
                    data: { estadoValidacion: 'RECHAZADO' },
                });

                // Notificar al cliente por WhatsApp
                if (pago.cliente?.numeroWhatsapp) {
                    const numero = pago.cliente.numeroWhatsapp;
                    const ultimoMensaje = await prisma.mensajeChat.findFirst({
                        where: { negocioId: pago.negocioId, remoteJid: { startsWith: numero } },
                        orderBy: { timestamp: 'desc' },
                    });
                    const jid = ultimoMensaje ? ultimoMensaje.remoteJid : `${numero}@s.whatsapp.net`;
                    const mensaje = `⏰ Hola ${pago.cliente.nombre}, tu reserva de cita fue *liberada automáticamente* porque no recibimos tu comprobante de anticipo dentro de la hora límite.\n\nSi deseas agendar nuevamente, escríbenos y con gusto te ayudamos.`;
                    await enviarMensaje(pago.negocioId, jid, mensaje).catch(err =>
                        console.error('[Cron] Error enviando notificación de expiración:', err)
                    );
                }
            }

            if (pagosExpirados.length > 0) {
                console.log(`[Cron] ✅ ${pagosExpirados.length} cita(s) liberada(s) por anticipo no recibido.`);
            }
        } catch (error) {
            console.error('[Cron] ❌ Error verificando pagos expirados:', error);
        }
    });
};