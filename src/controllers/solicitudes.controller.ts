import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { enviarMensaje } from '../services/whatsappClient';
export const getSolicitudes = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { estado } = req.query;
  try {
    const where: any = { negocioId };
    if (estado && ['PENDIENTE', 'COTIZADA', 'RECHAZADA'].includes(estado as string)) {
      where.estado = estado as string;
    }
    const solicitudes = await prisma.solicitud.findMany({
      where,
      include: {
        cliente: { select: { id: true, nombre: true, numeroWhatsapp: true } },
        artista: { select: { id: true, nombre: true } },
      },
      orderBy: { recibidaEn: 'desc' },
    });
    res.json({ data: solicitudes, error: null });
  } catch (error) {
    console.error('Error obteniendo solicitudes:', error);
    res.status(500).json({ data: null, error: 'Error al obtener solicitudes' });
  }
};
export const getSolicitudById = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { id } = req.params;
  try {
    const solicitud = await prisma.solicitud.findFirst({
      where: { id: parseInt(id), negocioId },
      include: {
        cliente: true,
        artista: { select: { id: true, nombre: true, email: true } },
        cita: true,
        mensajes: {
          orderBy: { timestamp: 'desc' },
          take: 50,
        },
      },
    });
    if (!solicitud) {
      return res.status(404).json({ data: null, error: 'Solicitud no encontrada' });
    }
    res.json({ data: solicitud, error: null });
  } catch (error) {
    console.error('Error obteniendo solicitud:', error);
    res.status(500).json({ data: null, error: 'Error al obtener solicitud' });
  }
};
export const cotizarSolicitud = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { id } = req.params;
  const { precioCotizado, horasEstimadas, seniaRequerida, artistaId } = req.body;
  try {
    if (precioCotizado === undefined || precioCotizado === null) {
      return res.status(400).json({ data: null, error: 'precioCotizado es requerido' });
    }
    if (horasEstimadas === undefined || horasEstimadas === null) {
      return res.status(400).json({ data: null, error: 'horasEstimadas es requerido' });
    }
    const solicitud = await prisma.solicitud.findFirst({
      where: { id: parseInt(id), negocioId },
    });
    if (!solicitud) {
      return res.status(404).json({ data: null, error: 'Solicitud no encontrada' });
    }
    if (solicitud.estado !== 'PENDIENTE') {
      return res.status(400).json({ data: null, error: `No se puede cotizar una solicitud en estado ${solicitud.estado}` });
    }
    if (artistaId) {
      const artista = await prisma.usuario.findFirst({
        where: { id: artistaId, negocioId },
      });
      if (!artista) {
        return res.status(404).json({ data: null, error: 'Artista no encontrado en este negocio' });
      }
    }
    const solicitudActualizada = await prisma.solicitud.update({
      where: { id: parseInt(id) },
      data: {
        estado: 'COTIZADA',
        precioCotizado,
        horasEstimadas,
        seniaRequerida: seniaRequerida || null,
        artistaId: artistaId || null,
        cotizadaEn: new Date(),
      },
      include: {
        cliente: { select: { id: true, nombre: true, numeroWhatsapp: true } },
        artista: { select: { id: true, nombre: true } },
      },
    });

    let mensajeWhatsAppEnviado = false;
    if (solicitudActualizada.cliente && solicitudActualizada.cliente.numeroWhatsapp) {
      const numero = solicitudActualizada.cliente.numeroWhatsapp;

      // Buscar el último mensaje de este número para saber si es @s.whatsapp.net o @lid
      const ultimoMensaje = await prisma.mensajeChat.findFirst({
        where: {
          negocioId,
          remoteJid: { startsWith: numero }
        },
        orderBy: { timestamp: 'desc' }
      });

      const jid = ultimoMensaje ? ultimoMensaje.remoteJid : `${numero}@s.whatsapp.net`;

      const mensaje = `Hola ${solicitudActualizada.cliente.nombre},\n\nTu solicitud de tatuaje ha sido revisada.\n💰 Costo total: $${precioCotizado}\n⏱️ Tiempo estimado: ${horasEstimadas} horas\n\n¿Para qué fecha te gustaría agendar tu cita? (Ej. "mañana", "el próximo viernes", "20 de mayo")`;
      mensajeWhatsAppEnviado = await enviarMensaje(negocioId, jid, mensaje);

      if (mensajeWhatsAppEnviado) {
        const datosSesion = {
          solicitudId: solicitudActualizada.id,
          horasEstimadas: horasEstimadas,
          nombre: solicitudActualizada.cliente.nombre,
          precioCotizado: precioCotizado
        };

        const sesionExistente = await prisma.sesionChat.findUnique({ where: { id: jid } });
        if (sesionExistente) {
          await prisma.sesionChat.update({
            where: { id: jid },
            data: { estado: 'ESPERANDO_FECHA', datos: datosSesion, ultimoMensaje: new Date() }
          });
        } else {
          await prisma.sesionChat.create({
            data: { id: jid, negocioId, estado: 'ESPERANDO_FECHA', datos: datosSesion }
          });
        }
      }
      return res.status(200).json({
        data: solicitudActualizada,
        error: null,
        warning: 'La cotización se guardó correctamente, pero no se pudo enviar el mensaje por WhatsApp. Asegúrate de que el bot esté conectado.'
      });
    }

    res.json({ data: solicitudActualizada, error: null, mensajeEnviado: true });
  } catch (error: any) {
    console.error('Error cotizando solicitud:', error?.message || error);
    console.error('Stack:', error?.stack);
    res.status(500).json({ data: null, error: 'Error al cotizar solicitud' });
  }
};
export const rechazarSolicitud = async (req: Request, res: Response) => {
  const negocioId = req.negocioId!;
  const { id } = req.params;
  try {
    const solicitud = await prisma.solicitud.findFirst({
      where: { id: parseInt(id), negocioId },
    });
    if (!solicitud) {
      return res.status(404).json({ data: null, error: 'Solicitud no encontrada' });
    }
    if (solicitud.estado === 'RECHAZADA') {
      return res.status(400).json({ data: null, error: 'La solicitud ya está rechazada' });
    }
    const solicitudActualizada = await prisma.solicitud.update({
      where: { id: parseInt(id) },
      data: { estado: 'RECHAZADA' },
    });
    res.json({ data: solicitudActualizada, error: null });
  } catch (error) {
    console.error('Error rechazando solicitud:', error);
    res.status(500).json({ data: null, error: 'Error al rechazar solicitud' });
  }
};
