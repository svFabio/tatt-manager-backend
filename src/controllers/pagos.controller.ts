import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { enviarMensaje } from '../services/whatsappClient';

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
    const where: Prisma.PagoWhereInput = { negocioId };
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

// ─── NUEVOS ENDPOINTS ─────────────────────────────────────────────────────────

/** GET /api/pagos/pendientes
 *  Devuelve pagos con comprobante recibido pero aún sin validar.
 */
export const getPagosPendientesValidacion = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  try {
    const pagos = await prisma.pago.findMany({
      where: {
        negocioId,
        estadoValidacion: 'PENDIENTE_VALIDACION',
        fotoComprobanteUrl: { not: null },
      },
      include: {
        cliente: { select: { id: true, nombre: true, numeroWhatsapp: true } },
        cita: { select: { id: true, fechaHoraInicio: true, tipoCita: true } },
      },
      orderBy: { registradoEn: 'asc' },
    });
    res.json({ data: pagos, error: null });
  } catch (error) {
    console.error('Error obteniendo pagos pendientes:', error);
    res.status(500).json({ data: null, error: 'Error al obtener pagos pendientes' });
  }
};

/** PATCH /api/pagos/:id/confirmar
 *  Aprueba el comprobante, confirma la cita y notifica al cliente por WhatsApp.
 */
export const confirmarPago = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { id } = req.params;
  try {
    const pago = await prisma.pago.findFirst({
      where: { id: parseInt(id), negocioId },
      include: {
        cliente: { select: { id: true, nombre: true, numeroWhatsapp: true } },
        cita: true,
      },
    });

    if (!pago) {
      return res.status(404).json({ data: null, error: 'Pago no encontrado' });
    }
    if (pago.estadoValidacion !== 'PENDIENTE_VALIDACION') {
      return res.status(400).json({ data: null, error: `El pago ya fue ${pago.estadoValidacion === 'APROBADO' ? 'aprobado' : 'rechazado'}` });
    }

    // 1. Marcar pago como aprobado
    const pagoActualizado = await prisma.pago.update({
      where: { id: parseInt(id) },
      data: { estadoValidacion: 'APROBADO' },
    });

    // 2. Confirmar la cita asociada
    if (pago.citaId) {
      await prisma.cita.update({
        where: { id: pago.citaId },
        data: { estadoCita: 'CONFIRMADA' },
      });
    }

    // 3. Notificar al cliente por WhatsApp
    if (pago.cliente?.numeroWhatsapp) {
      const numero = pago.cliente.numeroWhatsapp;
      const ultimoMensaje = await prisma.mensajeChat.findFirst({
        where: { negocioId, remoteJid: { startsWith: numero } },
        orderBy: { timestamp: 'desc' },
      });
      const jid = ultimoMensaje ? ultimoMensaje.remoteJid : `${numero}@s.whatsapp.net`;
      const mensaje = `✅ ¡Hola ${pago.cliente.nombre}! Tu comprobante de pago fue *confirmado*.\n\n🎨 Tu cita está agendada. ¡Te esperamos!\n\nSi tienes alguna duda, escríbenos aquí.`;
      await enviarMensaje(negocioId, jid, mensaje);
    }

    res.json({ data: pagoActualizado, error: null });
  } catch (error) {
    console.error('Error confirmando pago:', error);
    res.status(500).json({ data: null, error: 'Error al confirmar pago' });
  }
};

/** PATCH /api/pagos/:id/rechazar
 *  Rechaza el comprobante, cancela la cita y notifica al cliente por WhatsApp.
 */
export const rechazarPago = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { id } = req.params;
  const { motivo } = req.body; // opcional
  try {
    const pago = await prisma.pago.findFirst({
      where: { id: parseInt(id), negocioId },
      include: {
        cliente: { select: { id: true, nombre: true, numeroWhatsapp: true } },
        cita: true,
      },
    });

    if (!pago) {
      return res.status(404).json({ data: null, error: 'Pago no encontrado' });
    }
    if (pago.estadoValidacion !== 'PENDIENTE_VALIDACION') {
      return res.status(400).json({ data: null, error: `El pago ya fue ${pago.estadoValidacion === 'APROBADO' ? 'aprobado' : 'rechazado'}` });
    }

    // 1. Marcar pago como rechazado
    const pagoActualizado = await prisma.pago.update({
      where: { id: parseInt(id) },
      data: { estadoValidacion: 'RECHAZADO' },
    });

    // 2. Cancelar la cita asociada
    if (pago.citaId) {
      await prisma.cita.update({
        where: { id: pago.citaId },
        data: { estadoCita: 'CANCELADA' },
      });
    }

    // 3. Notificar al cliente por WhatsApp
    if (pago.cliente?.numeroWhatsapp) {
      const numero = pago.cliente.numeroWhatsapp;
      const ultimoMensaje = await prisma.mensajeChat.findFirst({
        where: { negocioId, remoteJid: { startsWith: numero } },
        orderBy: { timestamp: 'desc' },
      });
      const jid = ultimoMensaje ? ultimoMensaje.remoteJid : `${numero}@s.whatsapp.net`;
      let mensaje = `❌ Hola ${pago.cliente.nombre}, tu comprobante de pago fue *rechazado*.`;
      if (motivo) {
        mensaje += `\n\n📋 Motivo: ${motivo}`;
      }
      mensaje += `\n\nPor favor comunícate con nosotros para más información o envía un nuevo comprobante.`;
      await enviarMensaje(negocioId, jid, mensaje);
    }

    res.json({ data: pagoActualizado, error: null });
  } catch (error) {
    console.error('Error rechazando pago:', error);
    res.status(500).json({ data: null, error: 'Error al rechazar pago' });
  }
};
