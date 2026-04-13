import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
export const crearPago = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const usuarioId = req.usuario!.id;
  const { monto, clienteId, citaId, fotoComprobanteUrl } = req.body;
  try {
    if (!monto || monto <= 0) {
      return res.status(400).json({ data: null, error: 'monto debe ser mayor a 0' });
    }
    if (!clienteId) {
      return res.status(400).json({ data: null, error: 'clienteId es requerido' });
    }
    const cliente = await prisma.cliente.findFirst({
      where: { id: clienteId, negocioId },
    });
    if (!cliente) {
      return res.status(404).json({ data: null, error: 'Cliente no encontrado en este negocio' });
    }
    if (citaId) {
      const cita = await prisma.cita.findFirst({
        where: { id: citaId, negocioId },
      });
      if (!cita) {
        return res.status(404).json({ data: null, error: 'Cita no encontrada' });
      }
    }
    const nuevoPago = await prisma.pago.create({
      data: {
        negocioId,
        monto,
        clienteId,
        citaId: citaId || null,
        fotoComprobanteUrl: fotoComprobanteUrl || null,
        registradoPorId: usuarioId,
      },
      include: {
        cliente: { select: { id: true, nombre: true, numeroWhatsapp: true } },
        cita: { select: { id: true, tipoCita: true, fechaHoraInicio: true } },
      },
    });
    res.status(201).json({ data: nuevoPago, error: null });
  } catch (error) {
    console.error('Error creando pago:', error);
    res.status(500).json({ data: null, error: 'Error al registrar pago' });
  }
};
export const getPagos = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { citaId } = req.query;
  try {
    const where: any = { negocioId };
    if (citaId) {
      where.citaId = parseInt(citaId as string);
    }
    const pagos = await prisma.pago.findMany({
      where,
      include: {
        cliente: { select: { id: true, nombre: true, numeroWhatsapp: true } },
        cita: { select: { id: true, tipoCita: true, fechaHoraInicio: true } },
        registradoPor: { select: { id: true, nombre: true } },
      },
      orderBy: { registradoEn: 'desc' },
    });
    res.json({ data: pagos, error: null });
  } catch (error) {
    console.error('Error obteniendo pagos:', error);
    res.status(500).json({ data: null, error: 'Error al obtener pagos' });
  }
};
