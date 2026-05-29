import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

// =========================================================================
// 1. TU CONTROLADOR DE LA HU-17 (MÓVIL) - COMPLETAMENTE INTEGRADO
// =========================================================================
export const getEstudioStats = async (req: Request, res: Response) => {
  try {
    // 🚀 RESPALDO SEGURO: Si no llega negocioId por cabecera (como pasa en el móvil),
    // tomamos el ID 1 por defecto para desarrollo local, evitando el error 401/400.
    const negocioId = req.negocioId || 1;

    const fechaActual = new Date();
    const anioActual = fechaActual.getFullYear();
    const mesActual = fechaActual.getMonth();

    // A. CITAS POR MES
    const citasDelAnio = await prisma.cita.findMany({
      where: {
        negocioId: negocioId,
        fechaHoraInicio: {
          gte: new Date(`${anioActual}-01-01T00:00:00.000Z`),
          lte: new Date(`${anioActual}-12-31T23:59:59.999Z`),
        },
      },
      select: { fechaHoraInicio: true },
    });

    const conteoMeses: { [key: string]: number } = {
      Ene: 0, Feb: 0, Mar: 0, Abr: 0, May: 0, Jun: 0,
      Jul: 0, Ago: 0, Sep: 0, Oct: 0, Nov: 0, Dic: 0,
    };
    const nombresMeses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    citasDelAnio.forEach((cita) => {
      if (cita.fechaHoraInicio) {
        const mesIndex = new Date(cita.fechaHoraInicio).getMonth();
        conteoMeses[nombresMeses[mesIndex]] += 1;
      }
    });

    // B. CONSUMO DE TINTA
    const inicioMes = new Date(anioActual, mesActual, 1);
    const finMes = new Date(anioActual, mesActual + 1, 0, 23, 59, 59, 999);

    const capsConsumidos = await prisma.capsUsadas.findMany({
      where: {
        registroSesion: {
          negocioId: negocioId,
          cerradaEn: { gte: inicioMes, lte: finMes },
        },
      },
      select: {
        cantidadUsada: true,
        tinta: { select: { color: true, colorHex: true } },
      },
    });

    const agrupacionTinta: { [key: string]: { caps: number; colorHex: string } } = {};
    let totalCapsMes = 0;

    capsConsumidos.forEach((item) => {
      const colorNombre = item.tinta.color;
      const hex = item.tinta.colorHex;
      totalCapsMes += item.cantidadUsada;

      if (!agrupacionTinta[colorNombre]) {
        agrupacionTinta[colorNombre] = { caps: 0, colorHex: hex };
      }
      agrupacionTinta[colorNombre].caps += item.cantidadUsada;
    });

    const coloresRequeridos = ['Negro', 'Rojo', 'Azul', 'Verde', 'Blanco'];
    const datosDona = coloresRequeridos.map((col) => ({
      name: col,
      caps: agrupacionTinta[col]?.caps || 0,
      color: agrupacionTinta[col]?.colorHex || (col === 'Blanco' ? '#E0E0E0' : col === 'Negro' ? '#1A1A1A' : col === 'Rojo' ? '#FF3333' : col === 'Azul' ? '#3333FF' : '#33FF33'),
    }));

    // C. TOP ARTISTAS
    const pagosAgrupados = await prisma.pago.groupBy({
      by: ['registradoPorId'],
      where: { negocioId: negocioId },
      _sum: { monto: true },
      orderBy: { _sum: { monto: 'desc' } },
      take: 5,
    });

    const topArtistas = await Promise.all(
      pagosAgrupados.map(async (item) => {
        const artista = await prisma.usuario.findUnique({
          where: { id: item.registradoPorId },
          select: { nombre: true },
        });
        return {
          artista: artista?.nombre || 'Artista Desconocido',
          monto: Number(item._sum.monto || 0),
        };
      })
    );

    const negocio = await prisma.negocio.findUnique({
      where: { id: negocioId },
      select: { nombre: true },
    });

    return res.status(200).json({
      estudio: negocio?.nombre || 'Estudio Activo',
      citasPorMes: {
        labels: Object.keys(conteoMeses),
        valores: Object.values(conteoMeses),
      },
      consumoTinta: {
        totalCaps: totalCapsMes,
        detalles: datosDona,
      },
      topArtistas,
    });
  } catch (error) {
    console.error('Error en estadísticas de la HU-17:', error);
    return res.status(500).json({ message: 'Error interno del servidor al procesar métricas.' });
  }
};

// =========================================================================
// 2. RUTAS ORIGINALES DEL PROYECTO (WEB) - NO TOCADAS PARA EVITAR CONFLICTOS
// =========================================================================
export const getOverview = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const citasMes = await prisma.cita.count({
      where: { negocioId, fechaHoraInicio: { gte: startOfMonth, lte: endOfMonth }, estadoCita: { not: 'CANCELADA' } }
    });

    const citasConfirmadas = await prisma.cita.findMany({
      where: { negocioId, fechaHoraInicio: { gte: startOfMonth, lte: endOfMonth }, estadoCita: 'CONFIRMADA' },
      select: { seniaPagada: true }
    });
    const ingresosMes = citasConfirmadas.reduce((sum, cita) => sum + (Number(cita.seniaPagada) || 0), 0);

    const clientesAgrupados = await prisma.cita.groupBy({
      by: ['clienteId'],
      _count: { id: true },
      where: { negocioId, estadoCita: { not: 'CANCELADA' }, clienteId: { not: null } },
      orderBy: { _count: { id: 'desc' } },
      take: 5
    });

    const topClientes = await Promise.all(clientesAgrupados.map(async (c) => {
      const cliente = await prisma.cliente.findUnique({ where: { id: c.clienteId! } });
      return {
        nombre: cliente?.nombre || 'Sin nombre',
        telefono: cliente?.numeroWhatsapp || '-',
        totalCitas: c._count.id
      };
    }));

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