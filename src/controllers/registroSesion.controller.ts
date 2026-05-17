import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { descontarCaps, descontarAgujas } from '../services/stockService';
export const crearRegistroSesion = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const usuarioId = req.usuario!.id;
  const {
    citaId,
    duracionEnHoras,
    seniaRecibida = 0,
    cobroDelTrabajo,
    fotoResultadoUrl,
    observaciones,
    capsUsadas = [],
    agujasUsadas = [],
  } = req.body;
  try {
    if (!citaId || cobroDelTrabajo === undefined || duracionEnHoras === undefined) {
      return res.status(400).json({
        data: null,
        error: 'citaId, duracionEnHoras y cobroDelTrabajo son requeridos',
      });
    }
    const cita = await prisma.cita.findFirst({
      where: { id: citaId, negocioId },
    });
    if (!cita) {
      return res.status(404).json({ data: null, error: 'Cita no encontrada' });
    }
    if (cita.estadoCita === 'FINALIZADA') {
      return res.status(400).json({ data: null, error: 'Esta cita ya fue finalizada' });
    }
    if (cita.estadoCita === 'CANCELADA') {
      return res.status(400).json({ data: null, error: 'No se puede registrar sesión de una cita cancelada' });
    }
    if (!cita.clienteId) {
      return res.status(400).json({ data: null, error: 'La cita no tiene un cliente asignado' });
    }
    const totalDeLaSesion = new Prisma.Decimal(seniaRecibida).plus(new Prisma.Decimal(cobroDelTrabajo));
    const resultado = await prisma.$transaction(async (tx) => {
      const registro = await tx.registroSesion.create({
        data: {
          negocioId,
          citaId,
          artistaId: cita.artistaId || usuarioId,
          clienteId: cita.clienteId!,
          duracionEnHoras,
          seniaRecibida,
          cobroDelTrabajo,
          totalDeLaSesion,
          fotoResultadoUrl: fotoResultadoUrl || null,
          observaciones: observaciones || null,
        },
      });
      await tx.cita.update({
        where: { id: citaId },
        data: { estadoCita: 'FINALIZADA' },
      });
      if (capsUsadas.length > 0) {
        for (const cap of capsUsadas) {
          await tx.capsUsadas.create({
            data: {
              registroSesionId: registro.id,
              tintaId: cap.tintaId,
              tamanioCap: cap.tamanioCap,
              cantidadUsada: cap.cantidadUsada,
            },
          });
        }
        await descontarCaps(tx, capsUsadas, registro.id, usuarioId);
      }

      if (agujasUsadas.length > 0) {
        for (const aguja of agujasUsadas) {
          await tx.agujasUsadas.create({
            data: {
              registroSesionId: registro.id,
              agujaId: aguja.agujaId,
              cantidadUsada: aguja.cantidadUsada,
            },
          });
        }
        await descontarAgujas(tx, agujasUsadas, registro.id, usuarioId);
      }

      return registro;
    }, {
      maxWait: 10000,
      timeout: 20000,
    });
    const registroCompleto = await prisma.registroSesion.findUnique({
      where: { id: resultado.id },
      include: {
        cita: true,
        cliente: { select: { id: true, nombre: true, numeroWhatsapp: true } },
        artista: { select: { id: true, nombre: true } },
        capsUsadas: {
          include: { tinta: { select: { id: true, nombre: true, color: true, colorHex: true } } },
        },
        agujasUsadas: {
          include: { aguja: { select: { id: true, nombre: true, marca: true, tipo: true } } },
        },
      },
    });
    res.status(201).json({ data: registroCompleto, error: null });
  } catch (error: any) {
    console.error('Error creando registro de sesión:', error);
    if (error.status) {
      return res.status(error.status).json({ data: null, error: error.message });
    }
    res.status(500).json({ data: null, error: 'Error al crear registro de sesión' });
  }
};
export const getRegistrosSesion = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { artistaId, desde, hasta, search } = req.query;
  try {
    const where: any = { negocioId };
    if (artistaId) {
      where.artistaId = parseInt(artistaId as string);
    }
    if (desde || hasta) {
      where.cerradaEn = {};
      if (desde) where.cerradaEn.gte = new Date(desde as string);
      if (hasta) where.cerradaEn.lte = new Date(hasta as string);
    }
    if (search) {
      where.cliente = { nombre: { contains: search as string, mode: 'insensitive' } };
    }
    const registros = await prisma.registroSesion.findMany({
      where,
      include: {
        cita: { select: { id: true, tipoCita: true, fechaHoraInicio: true, zonaDelCuerpo: true } },
        cliente: { select: { id: true, nombre: true, numeroWhatsapp: true } },
        artista: { select: { id: true, nombre: true } },
        capsUsadas: {
          include: { tinta: { select: { id: true, nombre: true, color: true, colorHex: true, marca: true } } },
        },
        agujasUsadas: {
          include: { aguja: { select: { id: true, nombre: true, marca: true, tipo: true, calibre: true } } },
        },
      },
      orderBy: { cerradaEn: 'desc' },
    });
    res.json({ data: registros, error: null });
  } catch (error) {
    console.error('Error obteniendo registros de sesión:', error);
    res.status(500).json({ data: null, error: 'Error al obtener registros de sesión' });
  }
};
export const getRegistroSesionById = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { id } = req.params;
  try {
    const registro = await prisma.registroSesion.findFirst({
      where: { id: parseInt(id), negocioId },
      include: {
        cita: {
          include: { solicitud: true }
        },
        cliente: true,
        artista: { select: { id: true, nombre: true, email: true } },
        capsUsadas: {
          include: {
            tinta: { select: { id: true, nombre: true, marca: true, color: true, colorHex: true } },
          },
        },
        agujasUsadas: {
          include: {
            aguja: { select: { id: true, nombre: true, marca: true, tipo: true, calibre: true } },
          },
        },
        movimientosInventario: {
          include: { stockTinta: { include: { tinta: { select: { nombre: true, color: true } } } } },
        },
      },
    });
    if (!registro) {
      return res.status(404).json({ data: null, error: 'Registro de sesión no encontrado' });
    }
    res.json({ data: registro, error: null });
  } catch (error) {
    console.error('Error obteniendo registro de sesión:', error);
    res.status(500).json({ data: null, error: 'Error al obtener registro de sesión' });
  }
};
export const reportarRegistroSesion = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { id } = req.params;
  const { motivoReporte } = req.body;
  try {
    if (!motivoReporte || motivoReporte.trim().length === 0) {
      return res.status(400).json({ data: null, error: 'motivoReporte es requerido' });
    }
    const registro = await prisma.registroSesion.findFirst({
      where: { id: parseInt(id), negocioId },
    });
    if (!registro) {
      return res.status(404).json({ data: null, error: 'Registro de sesión no encontrado' });
    }
    const actualizado = await prisma.registroSesion.update({
      where: { id: parseInt(id) },
      data: {
        reportada: true,
        motivoReporte: motivoReporte.trim(),
      },
    });
    res.json({ data: actualizado, error: null });
  } catch (error) {
    console.error('Error reportando registro de sesión:', error);
    res.status(500).json({ data: null, error: 'Error al reportar registro de sesión' });
  }
};
