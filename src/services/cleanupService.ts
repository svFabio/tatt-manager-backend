
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Servicio de limpieza de sesiones y datos temporales
 */
export const iniciarCronJobs = () => {
    console.log('[Cron] 🕒 Iniciando planificador de tareas...');

    // Tarea 1: Limpiar sesiones inactivas cada 5 minutos
    // Se eliminan sesiones que no han tenido actividad en los últimos 30 minutos
    cron.schedule('*/5 * * * *', async () => {
        console.log('[Cron] 🧹 Ejecutando limpieza de sesiones expiradas...');
        try {
            const limiteTiempo = new Date(Date.now() - 30 * 60 * 1000); // 30 minutos atrás

            const resultado = await prisma.sesionChat.deleteMany({
                where: {
                    ultimoMensaje: {
                        lt: limiteTiempo
                    }
                }
            });

            if (resultado.count > 0) {
                console.log(`[Cron] ✅ Se eliminaron ${resultado.count} sesiones inactivas.`);
            } else {
                console.log('[Cron] Ninguna sesión expirada encontrada.');
            }
        } catch (error) {
            console.error('[Cron] ❌ Error en limpieza de sesiones:', error);
        }
    });
};
