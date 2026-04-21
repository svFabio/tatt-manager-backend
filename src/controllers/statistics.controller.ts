import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getOverview = async (req: Request, res: Response) => {
    const negocioId = req.negocioId!;
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const citasMes = await prisma.cita.count({
            where: { negocioId, fechaHoraInicio: { gte: startOfMonth, lte: endOfMonth }, estadoCita: { not: 'CANCELADA' } }
        });

        // Ingresos: Como 'monto' no existe, usamos seniaPagada. Si existe registro de Pago, tendrías que consultarlo.
        const citasConfirmadas = await prisma.cita.findMany({
            where: { negocioId, fechaHoraInicio: { gte: startOfMonth, lte: endOfMonth }, estadoCita: 'CONFIRMADA' },
            select: { seniaPagada: true }
        });
        const ingresosMes = citasConfirmadas.reduce((sum, cita) => sum + (Number(cita.seniaPagada) || 0), 0);

        // Agrupar por Cliente IDs validos
        const clientesAgrupados = await prisma.cita.groupBy({
            by: ['clienteId'],
            _count: { id: true },
            where: { negocioId, estadoCita: { not: 'CANCELADA' }, clienteId: { not: null } },
            orderBy: { _count: { id: 'desc' } },
            take: 5
        });

        // Completar Nombres recuperando los clientes
        const topClientes = await Promise.all(clientesAgrupados.map(async (c) => {
            const cliente = await prisma.cliente.findUnique({ where: { id: c.clienteId! } });
            return {
                nombre: cliente?.nombre || 'Sin nombre',
                telefono: cliente?.numeroWhatsapp || '-',
                totalCitas: c._count.id
            };
        }));

        // Horarios populares (Extrayendo la hora de fechaHoraInicio)
        const todasCitasMes = await prisma.cita.findMany({
            where: { negocioId, fechaHoraInicio: { gte: startOfMonth, lte: endOfMonth }, estadoCita: { not: 'CANCELADA' } },
            select: { fechaHoraInicio: true }
        });

        const horaryCount: Record<string, number> = {};
        todasCitasMes.forEach(c => {
            if (c.fechaHoraInicio) {
                const h = `${c.fechaHoraInicio.getHours().toString().padStart(2, '0')}:00`;
                horaryCount[h] = (horaryCount[h] || 0) + 1;
            }
        });
        const horariosPopulares = Object.entries(horaryCount)
            .map(([horario, totalReservas]) => ({ horario, totalReservas }))
            .sort((a, b) => b.totalReservas - a.totalReservas)
            .slice(0, 5);

        const ratingAgregado = await prisma.cita.aggregate({
            _avg: { rating: true },
            where: { negocioId, rating: { not: null } }
        });

        const ultimosComentarios = await prisma.cita.findMany({
            where: { negocioId, comentario: { not: null }, estadoCita: { not: 'CANCELADA' } },
            orderBy: { fechaHoraInicio: 'desc' },
            take: 5,
            select: { cliente: { select: { nombre: true } }, rating: true, comentario: true, fechaHoraInicio: true }
        });

        const ultimosComentariosFormato = ultimosComentarios.map(c => ({
            clienteNombre: c.cliente?.nombre || 'Anónimo',
            rating: c.rating,
            comentario: c.comentario,
            fecha: c.fechaHoraInicio
        }));

        // origen no existe en el schema Prisma de Cita que validamos, si falla tu tabla lo ajustaremos.
        const citasVirtuales = 0;
        const citasPresenciales = citasMes;

        res.json({
            citasMes,
            ingresosMes,
            topClientes,
            horariosPopulares,
            citasVirtuales,
            citasPresenciales,
            ratingPromedio: ratingAgregado._avg.rating || 0,
            ultimosComentarios: ultimosComentariosFormato
        });
    } catch (error) {
        console.error('Error en overview:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
};

export const getRevenue = async (req: Request, res: Response) => {
    const negocioId = req.negocioId!;
    try {
        const months = parseInt(req.query.months as string) || 6;
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

        const citas = await prisma.cita.findMany({
            where: { negocioId, fechaHoraInicio: { gte: startDate }, estadoCita: 'CONFIRMADA' },
            select: { fechaHoraInicio: true, seniaPagada: true }
        });

        const revenueByMonth: Record<string, number> = {};
        citas.forEach(cita => {
            if (!cita.fechaHoraInicio) return;
            const monthKey = `${cita.fechaHoraInicio.getFullYear()}-${String(cita.fechaHoraInicio.getMonth() + 1).padStart(2, '0')}`;
            revenueByMonth[monthKey] = (revenueByMonth[monthKey] || 0) + Number(cita.seniaPagada || 0);
        });

        const revenue = Object.entries(revenueByMonth)
            .map(([mes, total]) => ({ mes, total }))
            .sort((a, b) => a.mes.localeCompare(b.mes));

        res.json({ revenue });
    } catch (error) {
        console.error('Error en revenue:', error);
        res.status(500).json({ error: 'Error al obtener ingresos' });
    }
};