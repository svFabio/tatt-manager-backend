
import cron from 'node-cron';
// import { PrismaClient } from '@prisma/client';
// import { enviarMensaje } from './whatsappClient';

// const prisma = new PrismaClient();

// ============================================================
// ⚠️  DESACTIVADO POR DESARROLLO
// El sistema de encuestas post-cita está comentado para evitar
// enviar mensajes a números reales durante pruebas.
// Para reactivar: descomentar todo el cuerpo de iniciarSurvey.
// ============================================================

export const iniciarSurvey = () => {
    console.log('[Cron] 📊 Sistema de encuestas DESACTIVADO por desarrollo.');

    // cron.schedule('*/30 * * * *', async () => {
    //     const ahora = new Date();
    //     try {
    //         const haceDosDias = new Date(ahora.getTime() - 48 * 60 * 60 * 1000);
    //         const citas = await prisma.cita.findMany({
    //             where: {
    //                 estado: 'CONFIRMADA',
    //                 encuestaEnviada: false,
    //                 fecha: { gte: haceDosDias, lte: ahora }
    //             }
    //         });
    //         for (const cita of citas) {
    //             try {
    //                 const [horas, minutos] = cita.horario.split(':').map(Number);
    //                 const fechaCita = new Date(cita.fecha);
    //                 fechaCita.setHours(horas, minutos, 0, 0);
    //                 const tiempoEnvio = new Date(fechaCita.getTime() + 2 * 60 * 60 * 1000);
    //                 if (ahora >= tiempoEnvio) {
    //                     const sesionActiva = await prisma.sesionChat.findUnique({
    //                         where: { id: `${cita.clienteTelefono}@s.whatsapp.net` }
    //                     });
    //                     if (!sesionActiva) {
    //                         const mensaje = `Hola ${cita.clienteNombre || 'Cliente'}! 👋\n\nEsperamos que hayas disfrutado tu visita a Samsara Spa.\n\n🌟 *¿Cómo calificarías tu experiencia del 1 al 5?*\n(1 = Mala, 5 = Excelente)`;
    //                         await prisma.sesionChat.create({
    //                             data: {
    //                                 id: `${cita.clienteTelefono}@s.whatsapp.net`,
    //                                 estado: 'ESPERANDO_FEEDBACK',
    //                                 datos: { nombre: cita.clienteNombre || undefined, citaId: cita.id },
    //                                 ultimoMensaje: new Date()
    //                             }
    //                         });
    //                         const enviado = await enviarMensaje(`${cita.clienteTelefono}@s.whatsapp.net`, mensaje);
    //                         if (enviado) {
    //                             await prisma.cita.update({ where: { id: cita.id }, data: { encuestaEnviada: true } });
    //                             console.log(`[Survey] 📊 Encuesta enviada a ${cita.clienteTelefono}`);
    //                         } else {
    //                             await prisma.sesionChat.delete({ where: { id: `${cita.clienteTelefono}@s.whatsapp.net` } });
    //                         }
    //                     }
    //                 }
    //             } catch (error) {
    //                 console.error(`[Survey] Error procesando cita ${cita.id}:`, error);
    //             }
    //         }
    //     } catch (error) {
    //         console.error('[Survey] ❌ Error general:', error);
    //     }
    // });
};
