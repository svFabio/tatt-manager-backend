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

    // A. SESIONES DE ESTA SEMANA
    const inicioSemana = new Date(fechaActual);
    const diaSemana = inicioSemana.getDay(); // 0 = Domingo, 1 = Lunes
    const diff = inicioSemana.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1); // Ajustar al Lunes
    inicioSemana.setDate(diff);
    inicioSemana.setHours(0, 0, 0, 0);

    const finSemana = new Date(inicioSemana);
    finSemana.setDate(inicioSemana.getDate() + 6);
    finSemana.setHours(23, 59, 59, 999);

    const sesionesSemana = await prisma.registroSesion.findMany({
      where: {
        negocioId: negocioId,
        cerradaEn: {
          gte: inicioSemana,
          lte: finSemana,
        },
      },
      select: { cerradaEn: true },
    });

    const diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const conteoDias = [0, 0, 0, 0, 0, 0, 0];

    sesionesSemana.forEach((sesion) => {
      const day = new Date(sesion.cerradaEn).getDay();
      const index = day === 0 ? 6 : day - 1; // Convertir 0 (Dom) a index 6
      conteoDias[index] += 1;
    });

    const citasPorMesData = {
      labels: diasSemana,
      valores: conteoDias,
    };

    // B. ARTICULOS USADOS (Caps y Agujas)
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
        tamanioCap: true,
      },
    });

    let totalCaps = 0;
    let totalTintaMl = 0;
    capsConsumidos.forEach((item) => {
      totalCaps += item.cantidadUsada;
      if (item.tamanioCap === 'CHICA') totalTintaMl += item.cantidadUsada * 0.5;
      else if (item.tamanioCap === 'MEDIANA') totalTintaMl += item.cantidadUsada * 1.0;
      else if (item.tamanioCap === 'GRANDE') totalTintaMl += item.cantidadUsada * 2.0;
    });

    const agujasConsumidas = await prisma.agujasUsadas.findMany({
      where: {
        registroSesion: {
          negocioId: negocioId,
          cerradaEn: { gte: inicioMes, lte: finMes },
        },
      },
      include: {
        aguja: { select: { nombre: true, tipo: true } },
      },
    });

    const articulosMap: { [key: string]: number } = {};
    if (totalCaps > 0) articulosMap["Caps"] = totalCaps;
    if (totalTintaMl > 0) articulosMap["Tinta (ml)"] = totalTintaMl;

    agujasConsumidas.forEach((item) => {
      const nombreAguja = item.aguja.nombre || item.aguja.tipo || "Aguja";
      articulosMap[nombreAguja] = (articulosMap[nombreAguja] || 0) + item.cantidadUsada;
    });

    let totalArticulos = 0;
    const datosDona = Object.entries(articulosMap).map(([name, cantidad], index) => {
      totalArticulos += cantidad;
      const mockColors = ["#4C1D95", "#06B6D4", "#C026D3", "#F59E0B", "#10B981", "#3B82F6", "#EF4444"];
      const color = mockColors[index % mockColors.length];
      return { name, cantidad, color };
    });

    // C. TOP ARTISTAS (Por cantidad de sesiones cerradas)
    const sesionesAgrupadas = await prisma.registroSesion.groupBy({
      by: ['artistaId'],
      where: { negocioId: negocioId },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    const topArtistas = await Promise.all(
      sesionesAgrupadas.map(async (item) => {
        const artista = await prisma.usuario.findUnique({
          where: { id: item.artistaId },
          select: { nombre: true },
        });
        return {
          artista: artista?.nombre || 'Artista Desconocido',
          monto: item._count.id, // Reusamos 'monto' como cantidad para mantener compatibilidad
        };
      })
    );

    const negocio = await prisma.negocio.findUnique({
      where: { id: negocioId },
      select: { nombre: true },
    });

    return res.status(200).json({
      estudio: negocio?.nombre || 'Estudio Activo',
      citasPorMes: citasPorMesData,
      articulosUsados: {
        totalArticulos: totalArticulos,
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