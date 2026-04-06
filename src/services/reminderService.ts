
import cron from 'node-cron';
// import { PrismaClient } from '@prisma/client';
// import { enviarMensaje } from './whatsappClient';

// const prisma = new PrismaClient();

// ============================================================
// ⚠️  DESACTIVADO POR DESARROLLO
// El sistema de recordatorios está comentado para evitar
// enviar mensajes a números reales durante pruebas.
// Para reactivar: descomentar todo el cuerpo de iniciarRecordatorios.
// ============================================================

export const iniciarRecordatorios = () => {
    console.log('[Cron] ⏰ Sistema de recordatorios DESACTIVADO por desarrollo.');

    // cron.schedule('0 * * * *', async () => {
    //     console.log('[Cron] 📨 Verificando recordatorios pendientes...');
    //     const ahora = new Date();
    //     try {
    //         const citas = await prisma.cita.findMany({
    //             where: {
    //                 estado: 'CONFIRMADA',
    //                 fecha: { gte: new Date(ahora.getTime() - 24 * 60 * 60 * 1000) },
    //                 OR: [{ recordatorio24h: false }, { recordatorio1h: false }]
    //             }
    //         });
    //         for (const cita of citas) {
    //             try {
    //                 const [horas, minutos] = cita.horario.split(':').map(Number);
    //                 const fechaCita = new Date(cita.fecha);
    //                 fechaCita.setHours(horas, minutos, 0, 0);
    //                 const diffHoras = (fechaCita.getTime() - ahora.getTime()) / (1000 * 60 * 60);
    //
    //                 if (!cita.recordatorio24h && diffHoras <= 25 && diffHoras >= 23) {
    //                     const msg = `Hola ${cita.clienteNombre || 'Cliente'}! 👋\n\nTe recordamos tu cita de *${cita.servicio || 'Spa'}* para mañana a las *${cita.horario}*.\n\n📍 Te esperamos en Samsara Spa.\nSi necesitas reprogramar, avísanos con anticipación. ¡Nos vemos! ✨`;
    //                     const enviado = await enviarMensaje(`${cita.clienteTelefono}@s.whatsapp.net`, msg);
    //                     if (enviado) {
    //                         await prisma.cita.update({ where: { id: cita.id }, data: { recordatorio24h: true } });
    //                         console.log(`[Cron] ✅ Recordatorio 24h enviado a ${cita.clienteTelefono}`);
    //                     }
    //                 }
    //                 if (!cita.recordatorio1h && diffHoras <= 1.5 && diffHoras > 0.5) {
    //                     const msg = `¡Tu cita es en 1 hora! ⏳\n\nTe esperamos a las *${cita.horario}* para tu sesión de ${cita.servicio || 'Spa'}.`;
    //                     const enviado = await enviarMensaje(`${cita.clienteTelefono}@s.whatsapp.net`, msg);
    //                     if (enviado) {
    //                         await prisma.cita.update({ where: { id: cita.id }, data: { recordatorio1h: true } });
    //                         console.log(`[Cron] ✅ Recordatorio 1h enviado a ${cita.clienteTelefono}`);
    //                     }
    //                 }
    //             } catch (error) {
    //                 console.error(`[Cron] Error procesando cita ${cita.id}:`, error);
    //             }
    //         }
    //     } catch (error) {
    //         console.error('[Cron] ❌ Error general en recordatorios:', error);
    //     }
    // });
};
